// app/api/customer-lookup/register-return-date/route.ts
//
// 카카오 반납접수가 대여정보와 정상적으로 일치하면(CS서버 판단: 대여정보 조회 성공 + 물품명 생성 성공),
// 사람이 ERP 반납접수 화면에서 "전송" 버튼을 누르지 않아도 통합관리 반납요청일을 바로 등록하기 위한 API.
// (대표님 지시, 2026-09-07 — "일치하면 바로 접수, 대기 상태로 두지 말고")
//
// - unified 조회/DB 접근은 이 파일 안에서만 일어난다 (CLAUDE.md 3장 원칙).
// - 반납요청일만 patch한다 — 기존 /api/customer-reception/return-requests/submit의
//   patchUnifiedReturnRequest와 동일한 방식(데이터 병합, 구조 변경 없음).
//
// 인증: 헤더 x-cs-api-key 가 CS_SERVER_API_KEY 환경변수와 일치해야 한다
// (기존 /api/customer-lookup/rental, /api/customer-reception/packaging-orders와 동일한 방향의 인증키 재사용).

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.CS_SERVER_API_KEY || "").trim();
  if (!expected) return false; // 키 미설정 시 기본 거부(안전 우선)

  const provided = String(req.headers.get("x-cs-api-key") || "").trim();
  return !!provided && provided === expected;
}

function normalizeDate(v: unknown): string {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const unifiedId = Number(body?.unifiedId);
  const returnRequestDate = normalizeDate(body?.returnRequestDate);

  if (!Number.isFinite(unifiedId) || unifiedId <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_unified_id" }, { status: 400 });
  }
  if (!returnRequestDate) {
    return NextResponse.json({ ok: false, error: "invalid_return_request_date" }, { status: 400 });
  }

  try {
    const result = await query(
      `
      UPDATE unified
      SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb
      WHERE id = $2
      RETURNING id
      `,
      [JSON.stringify({ 반납요청일: returnRequestDate }), unifiedId]
    );

    if (!result.rows?.length) {
      return NextResponse.json({ ok: false, error: "unified_not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: unifiedId });
  } catch (e) {
    console.error("POST /api/customer-lookup/register-return-date error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
