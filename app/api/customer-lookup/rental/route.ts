// app/api/customer-lookup/rental/route.ts
//
// 전화번호로 대여정보를 조회하는 범용 데이터 API.
// - 카카오 전용이 아니다. CS서버(또는 그 외 인증된 클라이언트)가 호출한다.
// - unified 조회/DB 접근은 이 파일 안에서만 일어난다 (CLAUDE.md 3장 원칙).
// - 응답은 순수 JSON (카카오 응답 포맷 아님) — 호출하는 쪽에서 알아서 가공한다.
//
// 인증: 헤더 x-cs-api-key 가 CS_SERVER_API_KEY 환경변수와 일치해야 한다.
// (기존 ERP -> CS서버 방향의 x-erp-api-key 와 반대 방향)

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function normalizePhone(v: unknown): string {
  return String(v ?? "").replace(/[^0-9]/g, "");
}

function valueOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function isAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.CS_SERVER_API_KEY || "").trim();
  if (!expected) return false; // 키 미설정 시 기본 거부(안전 우선)

  const provided = String(req.headers.get("x-cs-api-key") || "").trim();
  return !!provided && provided === expected;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const phone = normalizePhone(req.nextUrl.searchParams.get("phone"));
  if (!phone) {
    return NextResponse.json({ ok: false, error: "invalid_phone" }, { status: 400 });
  }

  try {
    const r = await query(
      `
      SELECT u.id, u.data
      FROM unified u
      LEFT JOIN unified_order o ON o.unified_id = u.id
      WHERE
        regexp_replace(COALESCE(u.data->>'연락처1',''), '[^0-9]', '', 'g') = $1
        OR regexp_replace(COALESCE(u.data->>'연락처2',''), '[^0-9]', '', 'g') = $1
      ORDER BY
        CASE WHEN COALESCE(u.data->>'반납완료일','') = '' THEN 0 ELSE 1 END ASC,
        o.sort_key DESC NULLS LAST,
        u.id DESC
      LIMIT 1
      `,
      [phone]
    );

    const row = r.rows?.[0];
    if (!row) {
      return NextResponse.json({ ok: true, found: false });
    }

    const data = row.data && typeof row.data === "object" ? row.data : {};

    return NextResponse.json({
      ok: true,
      found: true,
      rental: {
        id: Number(row.id),
        수취인명: valueOrNull(data["수취인명"]),
        연락처1: valueOrNull(data["연락처1"]),
        연락처2: valueOrNull(data["연락처2"]),
        거래처분류: valueOrNull(data["거래처분류"]),
        제품: valueOrNull(data["제품"]),
        계약자주소: valueOrNull(data["계약자주소"]),
        시작일: valueOrNull(data["시작일"]),
        종료일: valueOrNull(data["종료일"]),
        반납요청일: valueOrNull(data["반납요청일"]),
        반납완료일: valueOrNull(data["반납완료일"]),
      },
    });
  } catch (e) {
    console.error("GET /api/customer-lookup/rental error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
