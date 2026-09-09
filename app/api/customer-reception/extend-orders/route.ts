// app/api/customer-reception/extend-orders/route.ts
//
// 연장/연체료 결제(payment_orders, order_type='extend') 조회/생성/삭제/전송완료표시 API.
// - GET: ERP "고객접수 > 연장·연체료" 그리드가 호출. 같은 DB라 인증 없이 내부에서 바로 조회한다
//   (포장재구매와 동일한 방식 — packaging-orders/route.ts 참고).
// - POST: 카카오 챗봇(CS서버)이 입금자명 확정 시점에 호출해서 새 "입금대기" 주문을 만든다.
//   인증: 헤더 x-cs-api-key 가 CS_SERVER_API_KEY 환경변수와 일치해야 한다
//   (기존 /api/customer-lookup/rental과 동일한 방향의 인증키를 재사용).
// - PATCH: 두 가지 용도(body로 구분).
//   1) { id } — ERP 그리드의 "전송" 버튼이 통합관리 n차연장 기록을 끝낸 뒤, 이 건을 "전송완료"로
//      표시한다(unified_synced_at). 이미 전송된 건은 다시 표시되지 않는다(WHERE ... IS NULL) —
//      중복전송으로 n차연장이 계속 쌓이는 사고를 막기 위한 안전장치.
//   2) { id, confirmMismatch: true, extendDays, amount } — "확인필요"(금액 다름) 건을 직원이
//      실입금액에 맞게 고친 뒤 확정 처리(status→confirmed, 새만기일 재계산)하고 입금확인
//      알림톡을 그 자리에서 발송한다. SMS 완전일치 자동확정과 다르게, 여기서는 값이 틀린 채로
//      알림톡이 먼저 나가면 안 되므로 직원이 고친 뒤에만 이 경로를 탄다(대표님 지시, 2026-09-08).
// - DELETE: ERP 그리드에서 체크한 행 삭제(끝내 입금 안 한 대기 건 정리용).

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { sendPaymentConfirmAlimtalk, type PaymentOrderForAlimtalk } from "@/lib/alimtalk/paymentConfirmAlimtalk";

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

// ✅ 기존 payment_orders 테이블에 컬럼만 추가(기존 데이터/다른 order_type 영향 없음, grid-settings의
//   ensureTable()과 동일한 "온디맨드로 존재 보장" 패턴). unified_synced_at: 통합관리 n차연장 전송완료
//   시각(중복전송 방지용). is_overdue_settlement: 카카오 대화에서 "연체료정산"으로 안내된 건인지
//   (연장이 더 저렴해서 "연장접수"로 안내된 건은 false) — 통합관리 결제수단 라벨(계좌이체 vs
//   계좌이체(연체료)) 판정에 사용.
async function ensureExtendColumns() {
  await query(`ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS unified_synced_at timestamptz`);
  await query(
    `ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS is_overdue_settlement boolean NOT NULL DEFAULT false`
  );
}

export async function GET() {
  try {
    await ensureExtendColumns();

    const result = await query(
      `
      SELECT
        po.id,
        po.unified_id,
        po.created_at,
        po.confirmed_at,
        po.status,
        COALESCE(u.data->>'수취인명', '') AS customer_name,
        COALESCE(u.data->>'연락처1', '') AS phone1,
        COALESCE(u.data->>'제품', '') AS device_model,
        COALESCE(u.data->>'거래처분류', '') AS partner_category,
        COALESCE(u.data->>'기기번호', '') AS device_no,
        COALESCE(u.data->>'특이사항1', '') AS unified_special_note1,
        po.extend_days,
        po.current_end_date::text AS current_end_date,
        po.new_end_date::text AS new_end_date,
        po.amount,
        po.depositor_name,
        po.is_overdue_settlement,
        po.unified_synced_at,
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
    await ensureExtendColumns();

    const body = await req.json().catch(() => null);

    const unifiedId = Number(body?.unifiedId);
    const extendDays = Number(body?.extendDays);
    const currentEndDate = valueOrNull(body?.currentEndDate);
    const newEndDate = valueOrNull(body?.newEndDate);
    const amount = Number(body?.amount);
    const depositorName = valueOrNull(body?.depositorName);
    const kakaoUserKey = valueOrNull(body?.kakaoUserKey);
    // 연체 중 "연체료정산"으로 안내된 건인지(연장이 더 저렴해 "연장접수"로 안내된 건은 false/미전달)
    const isOverdueSettlement = body?.isOverdueSettlement === true;

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
    // ⚠ phone1을 여기서 같이 저장해야 한다 — 이게 비어있으면 SMS 자동매칭으로 confirmed될 때
    //   sendPaymentConfirmAlimtalk()가 보낼 전화번호가 없어서 알림톡이 조용히 스킵된다(실제로
    //   발견된 버그, 2026-09-08 — 포장재구매는 phone1을 저장해서 정상이었는데 연장·연체료는
    //   빠져있었다).
    const result = await query(
      `
      INSERT INTO payment_orders (
        order_type, unified_id, extend_days, current_end_date, new_end_date,
        amount, depositor_name, kakao_user_key, is_overdue_settlement, phone1
      )
      VALUES (
        'extend', $1, $2, $3, $4, $5, $6, $7, $8,
        (SELECT data->>'연락처1' FROM unified WHERE id = $1)
      )
      ON CONFLICT (unified_id) WHERE status = 'waiting'
      DO UPDATE SET
        extend_days = EXCLUDED.extend_days,
        current_end_date = EXCLUDED.current_end_date,
        new_end_date = EXCLUDED.new_end_date,
        amount = EXCLUDED.amount,
        depositor_name = EXCLUDED.depositor_name,
        kakao_user_key = EXCLUDED.kakao_user_key,
        is_overdue_settlement = EXCLUDED.is_overdue_settlement,
        phone1 = EXCLUDED.phone1,
        created_at = now(),
        expires_at = now() + interval '24 hours'
      WHERE payment_orders.order_type = 'extend'
      RETURNING id
      `,
      [unifiedId, extendDays, currentEndDate, newEndDate, amount, depositorName, kakaoUserKey, isOverdueSettlement]
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

// ✅ 통합관리 반영(n차연장 기록)까지 끝난 뒤 "전송완료"로 표시. unified_synced_at이 이미 채워진
//   건은 WHERE절에 안 걸려서 RETURNING이 비고, 그러면 409로 "이미 전송됨"을 알려서 중복전송을 막는다.
export async function PATCH(req: NextRequest) {
  try {
    await ensureExtendColumns();

    const body = await req.json().catch(() => null);
    const id = Number(body?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
    }

    if (body?.confirmMismatch === true) {
      const extendDays = Number(body?.extendDays);
      const amount = Number(body?.amount);
      if (!Number.isFinite(extendDays) || extendDays <= 0) {
        return NextResponse.json({ ok: false, error: "invalid_extend_days" }, { status: 400 });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
      }

      // "확인필요"(matched) 건만 대상 — 이미 confirmed/기타 상태면 걸리지 않아서 RETURNING이 비고
      // 아래에서 409로 알려준다(중복 확정 방지).
      const result = await query(
        `
        UPDATE payment_orders po
        SET status = 'confirmed',
            confirmed_at = now(),
            confirmed_by = 'ERP수동확인(확인필요)',
            extend_days = $2,
            amount = $3,
            new_end_date = (po.current_end_date + ($2 || ' days')::interval)::date,
            phone1 = COALESCE(po.phone1, (SELECT data->>'연락처1' FROM unified WHERE id = po.unified_id))
        WHERE po.id = $1 AND po.order_type = 'extend' AND po.status = 'matched'
        RETURNING po.id, po.order_type, po.amount, po.depositor_name, po.phone1, po.item_name,
                  po.extend_days, po.new_end_date::text AS new_end_date
        `,
        [id, extendDays, amount]
      );

      const order = result.rows?.[0];
      if (!order) {
        return NextResponse.json({ ok: false, error: "not_mismatch_status" }, { status: 409 });
      }

      // 알림톡 발송 실패해도 확정 자체(위 UPDATE)는 이미 커밋됐으니 막지 않는다 — 로그만 남긴다.
      await sendPaymentConfirmAlimtalk(order as PaymentOrderForAlimtalk);

      return NextResponse.json({ ok: true, id: order.id });
    }

    const result = await query(
      `
      UPDATE payment_orders
      SET unified_synced_at = now()
      WHERE id = $1 AND order_type = 'extend' AND unified_synced_at IS NULL
      RETURNING id
      `,
      [id]
    );

    if (!result.rows?.[0]?.id) {
      return NextResponse.json({ ok: false, error: "already_synced" }, { status: 409 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("PATCH /api/customer-reception/extend-orders error:", e);
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
