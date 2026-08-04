import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getPhoneFromKakaoBody(body: any): string {
  return (
    body?.action?.params?.phone ||
    body?.action?.params?.전화번호 ||
    body?.action?.params?.tel ||
    body?.action?.params?.mobile ||
    body?.userRequest?.utterance ||
    "전화번호 없음"
  );
}

function maskPhone(phone: string): string {
  const onlyNumber = String(phone).replace(/[^0-9]/g, "");

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const inputPhone = getPhoneFromKakaoBody(body);
  const maskedPhone = maskPhone(inputPhone);

  return NextResponse.json({
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: {
            text:
              `테스트 조회 완료\n\n` +
              `입력 전화번호: ${inputPhone}\n\n` +
              `아래는 ERP 통합관리 조회 결과 예시입니다.\n\n` +
              `이름: 홍길동\n` +
              `연락처: ${maskedPhone}\n` +
              `대여한곳: 테스트 조리원\n` +
              `대여기종: 테스트 유축기\n` +
              `시작일: 2026-01-01\n` +
              `종료일: 2026-01-15\n\n` +
              `연장을 원하시면 상담원에게 연결해주세요.`,
          },
        },
      ],
    },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "카카오 렌탈 테스트 API가 정상 실행 중입니다.",
    skillUrl: "https://moulab.kr/api/kakao/rental-test",
  });
}