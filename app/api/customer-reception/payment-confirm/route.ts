// app/api/customer-reception/payment-confirm/route.ts
//
// 고객접수 > 입금확인 화면용 API.
// - GET: 아직 확정 안 된 입금 건(waiting: 입금대기 / matched: 문자로 매칭돼 확인 대기) 목록.
//   연장·연체료는 unified와 조인해서 고객명/기종/대여처를 보여주고,
//   포장재구매(parts)는 payment_orders에 이미 저장된 renter_name/item_name을 그대로 쓴다
//   (같은 DB라 CS서버를 거치지 않고 여기서 직접 조회 — packaging-orders/route.ts와 동일 원칙).
// - POST: 체크한 건을 사람이 최종 확인 → status='confirmed'. 로그인 사용자를 confirmed_by로 남긴다
//   (app/api/locks/route.ts와 동일한 방식으로 token 쿠키에서 꺼냄).

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type UserInfo = { username: string; name: string };

async function getCurrentUser(): Promise<UserInfo | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return null;

    const decoded = verifyToken(token);
    if (!decoded || typeof decoded !== "object") return null;

    const d = decoded as any;
    if (!d.username || !d.name) return null;

    return { username: d.username, name: d.name };
  } catch {
    return null;
  }
}

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
      WHERE po.status IN ('waiting', 'matched')
      ORDER BY po.created_at ASC
      `
    );

    return NextResponse.json({ ok: true, rows: result.rows || [] });
  } catch (e) {
    console.error("GET /api/customer-reception/payment-confirm error:", e);
    return NextResponse.json({ ok: false, error: "server", rows: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isFinite(n) && n > 0)
      : [];

    if (!ids.length) {
      return NextResponse.json({ ok: false, error: "no_ids" }, { status: 400 });
    }

    const result = await query(
      `
      UPDATE payment_orders
      SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = $1
      WHERE id = ANY($2::int[]) AND status IN ('waiting', 'matched')
      RETURNING id
      `,
      [user.name, ids]
    );

    return NextResponse.json({ ok: true, confirmedCount: result.rowCount ?? 0 });
  } catch (e) {
    console.error("POST /api/customer-reception/payment-confirm error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
