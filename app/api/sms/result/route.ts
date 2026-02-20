// app/api/sms/result/route.ts
//
// 정책 변경: "05시 1회 집계"만 사용 + 오류/중복/상태불일치 소지 제거를 위해
// 결과 동기화(확정) 기능을 서버에서 완전히 비활성화한다.
//
// POST /api/sms/result
// -> 항상 410(Gone) 반환, DB 변경 없음

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "disabled",
      message: "sms result sync is disabled. only 05:00 aggregate is allowed.",
    },
    { status: 410 }
  );
}