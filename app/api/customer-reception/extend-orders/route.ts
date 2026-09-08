// app/api/customer-reception/extend-orders/route.ts
//
// 연장/연체료 결제(payment_orders, order_type='extend') 조회/생성/삭제 API.
// - GET: ERP "고객접수 > 연장·연체료" 그리드가 호출. 같은 DB라 인증 없이 내부에서 바로 조회한다
//   (포장재구매와 동일한 방식 — packaging-orders/route.ts 참고).
// - POST: 카카오 챗봇(CS서버)이 입금자명 확정 시점에 호출해서 새 "입금대기" 주문을 만든다.
//   인증: 헤더 x-cs-api-key 가 CS_SERVER_API_KEY 환경변수와 일치해야 한다
//   (기존 /api/customer-lookup/rental과 동일한 방향의 인증키를 재사용).
// - DELETE: ERP 그리드에서 체크한 행 삭제(끝내 입금 안 한 대기 건 정리용).

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.CS_SERVER_API_KEY || "").trim();
  if (!expected) return false; // 키 미설정 시 기본 거부(안전 우선)

  const provided = String(req.headers.get("x-cs-api-key") || "").trim();
  return !!provided && provided === expected;
}

function valueOrNull(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

export async function GET() {
  try {
    const result = await query(
      `
      SELECT
        po.id,
        po.created_at,
        po.confirmed_at,
        po.status,
        COALESCE(u.data->>'수취인명', '') AS customer_name,
        COALESCE(u.data->>'연락처1', '') AS phone1,
        COALESCE(u.data->>'제품', '') AS device_model,
        COALESCE(u.data->>'거래처분류', '') AS partner_category,
        po.extend_days,
        po.new_end_date,
        po.amount,
        po.depositor_name,
        s.amount AS actual_amount
      FROM payment_orders po
      LEFT JOIN unified u ON u.id = po.unified_id
      LEFT JOIN LATERAL (
        SELECT amount FROM sms_inbound WHERE matched_id = po.id ORDER BY received_at DESC LIMIT 1
      ) s ON true
      WHERE po.order_type = 'extend'
      ORDER BY po.created_at DESC
      `
    );

    return NextResponse.json({ ok: true, rows: result.rows || [] });
  } catch (e) {
    console.error("GET /api/customer-reception/extend-orders error:", e);
    return NextResponse.json({ ok: false, error: "server", rows: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);

    const unifiedId = Number(body?.unifiedId);
    const extendDays = Number(body?.extendDays);
    const currentEndDate = valueOrNull(body?.currentEndDate);
    const newEndDate = valueOrNull(body?.newEndDate);
    const amount = Number(body?.amount);
    const depositorName = valueOrNull(body?.depositorName);
    const kakaoUserKey = valueOrNull(body?.kakaoUserKey);

    if (!Number.isFinite(unifiedId) || unifiedId <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_unified_id" }, { status: 400 });
    }
    if (!Number.isFinite(extendDays) || extendDays <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_extend_days" }, { status: 400 });
    }
    if (!currentEndDate || !newEndDate) {
      return NextResponse.json({ ok: false, error: "invalid_dates" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
    }
    if (!depositorName) {
      return NextResponse.json({ ok: false, error: "missing_depositor_name" }, { status: 400 });
    }

    // ⚠ uq_payment_orders_waiting(unified_id WHERE status='waiting')은 order_type 구분 없이
    //   "같은 대여건에 대기 중인 결제 1건만" 허용한다(packaging-orders/route.ts와 동일 제약).
    //   같은 종류(extend)끼리 충돌하면 최신 내용으로 덮어쓰고(재신청 처리), 다른 종류(포장재구매
    //   등)의 대기 건과 충돌하면 막는다(WHERE절이 안 맞아서 RETURNING이 비면 아래에서 감지).
    const result = await query(
      `
      INSERT INTO payment_orders (
        order_type, unified_id, extend_days, current_end_date, new_end_date,
        amount, depositor_name, kakao_user_key
      )
      VALUES ('extend', $1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (unified_id) WHERE status = 'waiting'
      DO UPDATE SET
        extend_days = EXCLUDED.extend_days,
        current_end_date = EXCLUDED.current_end_date,
        new_end_date = EXCLUDED.new_end_date,
        amount = EXCLUDED.amount,
        depositor_name = EXCLUDED.depositor_name,
        kakao_user_key = EXCLUDED.kakao_user_key,
        created_at = now(),
        expires_at = now() + interval '24 hours'
      WHERE payment_orders.order_type = 'extend'
      RETURNING id
      `,
      [unifiedId, extendDays, currentEndDate, newEndDate, amount, depositorName, kakaoUserKey]
    );

    const id = result.rows?.[0]?.id;
    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "already_waiting_other_type",
          message: "이미 다른 종류(포장재구매 등)의 결제 대기 건이 있어 연장 접수를 등록하지 못했습니다.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("POST /api/customer-reception/extend-orders error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
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

    const result = await query(
      `DELETE FROM payment_orders WHERE id = ANY($1::int[]) AND order_type = 'extend'`,
      [ids]
    );

    return NextResponse.json({ ok: true, deletedCount: result.rowCount ?? 0 });
  } catch (e) {
    console.error("DELETE /api/customer-reception/extend-orders error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
