// app/api/customer-reception/payment-confirm/route.ts
//
// 고객접수 > 입금확인 화면용 API.
// - 문자 매칭(app/api/sms/inbound)이 곧바로 status='confirmed'까지 자동 확정하므로
//   이 화면은 "확인" 액션이 없다 — 입금대기/입금확인 상태를 보여주고, 체크한 건을 정리(삭제)만 한다.
// - GET: 전체 목록(연장·연체료는 unified와 조인해서 고객명/기종/대여처 표시,
//   포장재구매는 payment_orders에 저장된 renter_name/item_name 그대로 사용).
// - DELETE: 체크한 건 삭제(잘못 접수됐거나 더 이상 필요 없는 건 정리용).

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await query(
      `
      SELECT
        po.id,
        po.order_type,
        po.created_at AS received_at,
        COALESCE(po.renter_name, u.data->>'수취인명') AS customer_name,
        CASE WHEN po.order_type = 'parts' THEN po.item_name ELSE u.data->>'제품' END AS device_model,
        u.data->>'거래처분류' AS partner_category,
        po.extend_days,
        po.new_end_date,
        po.amount,
        po.depositor_name,
        po.status,
        po.expires_at
      FROM payment_orders po
      LEFT JOIN unified u ON u.id = po.unified_id
      ORDER BY po.created_at DESC
      `
    );

    return NextResponse.json({ ok: true, rows: result.rows || [] });
  } catch (e) {
    console.error("GET /api/customer-reception/payment-confirm error:", e);
    return NextResponse.json({ ok: false, error: "server", rows: [] }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];

    if (!ids.length) {
      return NextResponse.json({ ok: false, error: "no_ids" }, { status: 400 });
    }

    const result = await query(`DELETE FROM payment_orders WHERE id = ANY($1::int[])`, [ids]);

    return NextResponse.json({ ok: true, deletedCount: result.rowCount ?? 0 });
  } catch (e) {
    console.error("DELETE /api/customer-reception/payment-confirm error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
