// app/api/customer-lookup/packaging-order/route.ts
//
// 전화번호로 "입금 확인된(status='confirmed') 가장 최근 포장재구매(payment_orders,
// order_type='parts')" 1건을 조회하는 API. CS서버가 카카오 "포장재환불" 흐름에서
// 환불금액(구매금액 − 왕복택배비)을 계산하려고 호출한다.
// - 카카오 전용이 아니다. CS서버(또는 그 외 인증된 클라이언트)가 호출한다.
// - unified/payment_orders 조회는 이 파일 안에서만 일어난다 (CLAUDE.md 3장 원칙).
//
// 인증: 헤더 x-cs-api-key 가 CS_SERVER_API_KEY 환경변수와 일치해야 한다.
// (기존 /api/customer-lookup/rental과 동일한 방향의 인증키 재사용)

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function normalizePhone(v: unknown): string {
  return String(v ?? "").replace(/[^0-9]/g, "");
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
    const result = await query(
      `
      SELECT item_name, amount, confirmed_at
      FROM payment_orders
      WHERE
        order_type = 'parts'
        AND status = 'confirmed'
        AND (
          regexp_replace(COALESCE(phone1, ''), '[^0-9]', '', 'g') = $1
          OR regexp_replace(COALESCE(phone2, ''), '[^0-9]', '', 'g') = $1
        )
      ORDER BY confirmed_at DESC
      LIMIT 1
      `,
      [phone]
    );

    const row = result.rows?.[0];
    if (!row) {
      return NextResponse.json({ ok: true, order: null });
    }

    return NextResponse.json({
      ok: true,
      order: {
        itemName: row.item_name,
        amount: row.amount,
        confirmedAt: row.confirmed_at,
      },
    });
  } catch (e) {
    console.error("GET /api/customer-lookup/packaging-order error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
