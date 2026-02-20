// app/api/sms/recompute/route.ts
//
// 정책 변경: "05시 1회 집계"만 허용
// - 05시 집계 이후 통합관리 수정으로 sms_targets가 변형되는 경로를 제거하기 위해
//   즉시반영(recompute) API를 완전히 비활성화한다.
//
// POST /api/sms/recompute
// -> 항상 410(Gone) 반환, DB 변경 없음

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "disabled",
      message: "sms recompute is disabled. only 05:00 base aggregate is allowed.",
    },
    { status: 410 }
  );
}