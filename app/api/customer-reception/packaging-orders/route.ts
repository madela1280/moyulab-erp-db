// app/api/customer-reception/packaging-orders/route.ts
//
// 포장재구매(payment_orders, order_type='parts') 조회/생성 API.
// - GET: ERP "고객접수 > 포장재구매" 그리드가 호출. 같은 DB라 인증 없이 내부에서 바로 조회한다
//   (반납접수처럼 CS서버 API를 거칠 필요 없음 — payment_orders는 이미 ERP DB에 있음).
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
        po.renter_name,
        po.phone1,
        po.phone2,
        po.shipping_address,
        po.item_name,
        po.amount,
        po.depositor_name,
        po.status,
        po.created_at,
        po.confirmed_at,
        s.amount AS actual_amount
      FROM payment_orders po
      LEFT JOIN LATERAL (
        SELECT amount FROM sms_inbound WHERE matched_id = po.id ORDER BY received_at DESC LIMIT 1
      ) s ON true
      WHERE po.order_type = 'parts'
      ORDER BY po.created_at DESC
      `
    );

    return NextResponse.json({ ok: true, rows: result.rows || [] });
  } catch (e) {
    console.error("GET /api/customer-reception/packaging-orders error:", e);
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
    const amount = Number(body?.amount);
    const depositorName = valueOrNull(body?.depositorName);
    const renterName = valueOrNull(body?.renterName);
    const phone1 = valueOrNull(body?.phone1);
    const phone2 = valueOrNull(body?.phone2);
    const shippingAddress = valueOrNull(body?.shippingAddress);
    const itemName = valueOrNull(body?.itemName);
    const kakaoUserKey = valueOrNull(body?.kakaoUserKey);

    if (!Number.isFinite(unifiedId) || unifiedId <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_unified_id" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
    }
    if (!depositorName) {
      return NextResponse.json({ ok: false, error: "missing_depositor_name" }, { status: 400 });
    }

    // ⚠ uq_payment_orders_waiting(unified_id WHERE status='waiting')은 order_type 구분 없이
    //   "같은 대여건에 대기 중인 결제 1건만" 허용한다(이일호 이사 원설계). 예전엔 이 제약에 걸리면
    //   그냥 INSERT 실패로 끝났는데 — 고객이 포장재 구매를 다시(예: 품목 변경) 신청하면 예전 waiting
    //   건과 충돌해서 새 주문이 조용히 사라지는 문제가 실제로 있었다(카톡엔 성공으로 나가는데 ERP엔 안 뜸).
    //   그래서 "같은 포장재구매(parts) 종류끼리의 충돌"이면 최신 내용으로 덮어쓰기(재신청 처리)한다.
    //   다른 종류(연장/연체료)의 대기 건과 충돌한 경우는 여전히 막는다(WHERE절이 false면 업데이트 안 되고
    //   RETURNING이 비어서 아래에서 감지된다).
    const result = await query(
      `
      INSERT INTO payment_orders (
        order_type, unified_id, amount, depositor_name,
        renter_name, phone1, phone2, shipping_address, item_name,
        kakao_user_key
      )
      VALUES ('parts', $1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (unified_id) WHERE status = 'waiting'
      DO UPDATE SET
        amount = EXCLUDED.amount,
        depositor_name = EXCLUDED.depositor_name,
        renter_name = EXCLUDED.renter_name,
        phone1 = EXCLUDED.phone1,
        phone2 = EXCLUDED.phone2,
        shipping_address = EXCLUDED.shipping_address,
        item_name = EXCLUDED.item_name,
        kakao_user_key = EXCLUDED.kakao_user_key,
        created_at = now()
      WHERE payment_orders.order_type = 'parts'
      RETURNING id
      `,
      [unifiedId, amount, depositorName, renterName, phone1, phone2, shippingAddress, itemName, kakaoUserKey]
    );

    const id = result.rows?.[0]?.id;
    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: "already_waiting_other_type",
          message: "이미 다른 종류(연장/연체료)의 결제 대기 건이 있어 포장재구매를 등록하지 못했습니다.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("POST /api/customer-reception/packaging-orders error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isFinite(n) && n > 0) : [];

    if (!ids.length) {
      return NextResponse.json({ ok: false, error: "no_ids" }, { status: 400 });
    }

    const result = await query(
      `DELETE FROM payment_orders WHERE id = ANY($1::int[]) AND order_type = 'parts'`,
      [ids]
    );

    return NextResponse.json({ ok: true, deletedCount: result.rowCount ?? 0 });
  } catch (e) {
    console.error("DELETE /api/customer-reception/packaging-orders error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
