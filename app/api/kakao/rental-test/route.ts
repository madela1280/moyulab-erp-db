import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type RentalInfo = {
  id: number;
  name: string;
  phone1: string;
  phone2: string;
  partnerType: string;
  productModel: string;
  product: string;
  startDate: string;
  endDate: string;
};

function getPhoneFromKakaoBody(body: any): string {
  return (
    body?.action?.params?.전화 ||
    body?.action?.params?.phone ||
    body?.action?.params?.전화번호 ||
    body?.action?.params?.tel ||
    body?.action?.params?.mobile ||
    body?.action?.detailParams?.전화?.origin ||
    body?.action?.detailParams?.전화?.value ||
    body?.action?.detailParams?.phone?.origin ||
    body?.action?.detailParams?.phone?.value ||
    body?.action?.detailParams?.전화번호?.origin ||
    body?.action?.detailParams?.전화번호?.value ||
    body?.userRequest?.utterance ||
    ""
  );
}

function normalizePhone(phone: string): string {
  return String(phone || "").replace(/[^0-9]/g, "");
}

function maskPhone(phone: string): string {
  const onlyNumber = normalizePhone(phone);

  if (onlyNumber.length < 7) {
    return phone || "-";
  }

  const last4 = onlyNumber.slice(-4);

  if (onlyNumber.length === 11) {
    return `${onlyNumber.slice(0, 3)}-****-${last4}`;
  }

  if (onlyNumber.length === 10) {
    return `${onlyNumber.slice(0, 3)}-***-${last4}`;
  }

  return `****-${last4}`;
}

function valueOrDash(value: any): string {
  const text = String(value ?? "").trim();
  return text ? text : "-";
}

function kakaoText(text: string) {
  return NextResponse.json({
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: {
            text,
          },
        },
      ],
    },
  });
}

async function findRentalInfoByPhone(phone: string): Promise<RentalInfo | null> {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  const result = await query(
    `
    SELECT
      u.id,
      u.data
    FROM unified u
    LEFT JOIN unified_order o ON o.unified_id = u.id
    WHERE
      regexp_replace(COALESCE(u.data->>'연락처1', ''), '[^0-9]', '', 'g') = $1
      OR
      regexp_replace(COALESCE(u.data->>'연락처2', ''), '[^0-9]', '', 'g') = $1
    ORDER BY
      CASE
        WHEN COALESCE(u.data->>'반납완료일', '') = '' THEN 0
        ELSE 1
      END ASC,
      o.sort_key DESC NULLS LAST,
      u.id DESC
    LIMIT 1
    `,
    [normalizedPhone]
  );

  const row = result.rows?.[0];

  if (!row) {
    return null;
  }

  const data = row.data || {};

  return {
    id: Number(row.id),
    name: valueOrDash(data["수취인명"]),
    phone1: valueOrDash(data["연락처1"]),
    phone2: valueOrDash(data["연락처2"]),
    partnerType: valueOrDash(data["거래처분류"]),
    productModel: valueOrDash(data["기종"]),
    product: valueOrDash(data["제품"]),
    startDate: valueOrDash(data["시작일"]),
    endDate: valueOrDash(data["종료일"]),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const inputPhone = getPhoneFromKakaoBody(body);
    const normalizedPhone = normalizePhone(inputPhone);

    if (!normalizedPhone) {
      return kakaoText(
        `전화번호를 확인하지 못했습니다.\n\n대여 시 등록한 전화번호를 다시 입력해주세요.`
      );
    }

    const rentalInfo = await findRentalInfoByPhone(normalizedPhone);

    if (!rentalInfo) {
      return kakaoText(
        `입력하신 전화번호로 대여 정보를 찾지 못했습니다.\n\n` +
          `입력 전화번호: ${inputPhone}\n\n` +
          `번호를 다시 확인하시거나 상담원에게 문의해주세요.`
      );
    }

    const displayPhone =
      normalizePhone(rentalInfo.phone1) === normalizedPhone
        ? rentalInfo.phone1
        : rentalInfo.phone2;

    const displayProduct =
      rentalInfo.productModel !== "-"
        ? rentalInfo.productModel
        : rentalInfo.product;

    return kakaoText(
      `대여정보 조회 결과입니다.\n\n` +
        `이름: ${rentalInfo.name}\n` +
        `연락처: ${maskPhone(displayPhone)}\n` +
        `대여한곳/거래처분류: ${rentalInfo.partnerType}\n` +
        `대여기종: ${displayProduct}\n` +
        `시작일: ${rentalInfo.startDate}\n` +
        `종료일: ${rentalInfo.endDate}\n\n` +
        `연장을 원하시면 상담원에게 연결해주세요.`
    );
  } catch (error) {
    console.error("[KAKAO_RENTAL_LOOKUP_ERROR]", error);

    return kakaoText(
      `대여정보 조회 중 오류가 발생했습니다.\n\n잠시 후 다시 시도해주세요.`
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "카카오 렌탈 조회 API가 정상 실행 중입니다.",
    skillUrl: "https://moulab.kr/api/kakao/rental-test",
  });
}