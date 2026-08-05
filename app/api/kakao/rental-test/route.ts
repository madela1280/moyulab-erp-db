import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RentalInfo = {
  name: string;
  phone: string;
  rentalPlace: string;
  customerType: string;
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
    body?.action?.detailParams?.phone?.origin ||
    body?.action?.detailParams?.전화번호?.origin ||
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
    return phone;
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

/**
 * TODO: 다음 단계에서 ERP 통합관리 DB 실제 조회 코드로 교체할 부분
 *
 * 지금은 카카오 연결 안정화를 위해 테스트 데이터 반환.
 * 다음에 여기만 DB 조회로 바꾸면 됩니다.
 */
async function findRentalInfoByPhone(phone: string): Promise<RentalInfo | null> {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  // 임시 테스트 데이터
  return {
    name: "홍길동",
    phone: normalizedPhone,
    rentalPlace: "테스트 조리원",
    customerType: "테스트 거래처",
    product: "테스트 유축기",
    startDate: "2026-01-01",
    endDate: "2026-01-15",
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

    return kakaoText(
      `대여정보 조회 결과입니다.\n\n` +
        `이름: ${rentalInfo.name}\n` +
        `연락처: ${maskPhone(rentalInfo.phone)}\n` +
        `대여한곳: ${rentalInfo.rentalPlace}\n` +
        `거래처분류: ${rentalInfo.customerType}\n` +
        `대여기종: ${rentalInfo.product}\n` +
        `시작일: ${rentalInfo.startDate}\n` +
        `종료일: ${rentalInfo.endDate}\n\n` +
        `연장을 원하시면 상담원에게 연결해주세요.`
    );
  } catch (error) {
    console.error("[KAKAO_RENTAL_TEST_ERROR]", error);

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