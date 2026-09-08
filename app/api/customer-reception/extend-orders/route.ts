// app/api/customer-reception/extend-orders/route.ts
//
// 연장/연체료 결제(payment_orders, order_type='extend') 생성 API.
// - POST: 카카오 챗봇(CS서버)이 입금자명 확정 시점에 호출해서 새 "입금대기" 주문을 만든다.
//   인증: 헤더 x-cs-api-key 가 CS_SERVER_API_KEY 환경변수와 일치해야 한다
//   (기존 /api/customer-lookup/rental, /api/customer-reception/packaging-orders와 동일한
//   방향의 인증키를 재사용 — packaging-orders/route.ts 참고).
// - GET/DELETE는 아직 안 만듦 — "입금확인" 화면(payment-confirm)이 이미 order_type 구분 없이
//   전체를 조회하고 있어서(extend_days/new_end_date 컬럼도 이미 조회 중) 당장 조회 API가
//   따로 필요 없다. 화면 전용 UI가 필요해지면(작업 순서 7단계) 그때 추가한다.

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
