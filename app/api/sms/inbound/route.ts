// app/api/sms/inbound/route.ts
//
// 입금 문자 수신 → 파싱 → payment_orders 매칭
//
// 폰의 문자 자동전달 앱(SMS Forwarder 등)이 이 주소로 POST 합니다.
//   URL:    https://moulab.kr/api/sms/inbound
//   헤더:   x-sms-secret: (환경변수 SMS_INBOUND_SECRET 값)
//   본문:   { "text": "문자 원문" }   또는 text/plain 원문 그대로
//
// 매칭 규칙 (2단계):
//   1) 금액+입금자명 완전일치 + waiting 1건        → status='confirmed'(자동 확정)
//   2) 완전일치 0건인데 입금자명만 waiting 중 1건과 일치 → status='matched'("확인필요" — 금액이 다르게
//      들어온 경우. 실입금액은 sms_inbound.amount에 남아있고 matched_id로 이 건과 연결되므로,
//      화면에서 예정액(payment_orders.amount)과 조인해서 차액을 보여줄 수 있다.)
//   3) 그 외(0건·2건 이상 충돌)                    → 원문만 보관, 직원 수동 처리
//
// ★ 이름+금액이 둘 다 맞으면 사람이 다시 확인하는 단계 없이 바로 확정한다 — 대표님 지시.
//   (동명이인 오매칭 방지는 "waiting 정확히 1건"이라는 매칭 조건 자체로만 건다 — 실시간 처리라
//   같은 이름+같은 금액이 동시에 대기 중일 확률은 사실상 없다고 판단, 별도 시간창 필터는 안 둠.)

import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { parseDepositSms } from "@/api/kakao/_lib/sms-parse";
import { sendPaymentConfirmAlimtalk } from "@/lib/alimtalk/paymentConfirmAlimtalk";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // 인증 — 비밀키 없으면 전부 거부
  const secret = process.env.SMS_INBOUND_SECRET;
  if (!secret || req.headers.get("x-sms-secret") !== secret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  // 본문: JSON {text} 또는 평문
  let raw = "";
  try {
    const ct = req.headers.get("content-type") ?? "";
    raw = ct.includes("json") ? String((await req.json())?.text ?? "") : await req.text();
  } catch {
    raw = "";
  }
  raw = raw.slice(0, 500);
  if (!raw.trim()) return Response.json({ ok: false, reason: "empty" }, { status: 400 });

  const parsed = parseDepositSms(raw);

  // 원문은 항상 보관 (매칭 실패 건 수동 처리 + 감사 추적)
  const ins = await query(
    `INSERT INTO sms_inbound (raw_text, parsed_ok, amount, depositor)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [raw, parsed.ok, parsed.amount, parsed.depositor]
  );
  const smsId = ins.rows[0].id;

  if (!parsed.ok) {
    return Response.json({ ok: true, matched: false, reason: parsed.reason ?? "파싱 실패" });
  }

  // 매칭: 금액 + 입금자명 + waiting, 유효기간 내
  const r = await query(
    `SELECT id, order_type, amount, depositor_name, phone1, item_name, extend_days, new_end_date
     FROM payment_orders
     WHERE status = 'waiting'
       AND amount = $1
       AND depositor_name = $2
       AND expires_at > now()
     ORDER BY created_at ASC`,
    [parsed.amount, parsed.depositor]
  );

  if (r.rows.length === 1) {
    const order = r.rows[0];
    const orderId = order.id;
    await query(
      `UPDATE payment_orders
       SET status = 'confirmed', confirmed_at = now(), confirmed_by = 'SMS자동매칭',
           memo = COALESCE(memo,'') || '[SMS자동매칭 ' || now()::date || '] '
       WHERE id = $1 AND status = 'waiting'`,
      [orderId]
    );
    await query(`UPDATE sms_inbound SET matched_id = $1 WHERE id = $2`, [orderId, smsId]);
    await sendPaymentConfirmAlimtalk(order);

    console.log("[SMS_MATCH]", JSON.stringify({ orderId, amount: parsed.amount }));
    return Response.json({ ok: true, matched: true, orderId });
  }

  if (r.rows.length === 0) {
    // 완전일치 0건 — 입금자명만으로 다시 찾아본다(금액이 다르게 들어온 경우). 이름도 여러 건이면 수동으로 넘긴다.
    const byName = await query(
      `SELECT id FROM payment_orders
       WHERE status = 'waiting'
         AND depositor_name = $1
         AND expires_at > now()
       ORDER BY created_at ASC`,
      [parsed.depositor]
    );

    if (byName.rows.length === 1) {
      const orderId = byName.rows[0].id;
      await query(
        `UPDATE payment_orders
         SET status = 'matched',
             memo = COALESCE(memo,'') || '[SMS 이름일치·금액상이 ' || now()::date || ' 실입금 ' || $2 || '원] '
         WHERE id = $1 AND status = 'waiting'`,
        [orderId, parsed.amount]
      );
      await query(`UPDATE sms_inbound SET matched_id = $1 WHERE id = $2`, [orderId, smsId]);

      console.log("[SMS_MATCH_AMOUNT_MISMATCH]", JSON.stringify({ orderId, amount: parsed.amount }));
      return Response.json({ ok: true, matched: true, orderId, reason: "이름 일치·금액 상이 — 확인필요로 표시" });
    }

    await query(`UPDATE sms_inbound SET parsed_ok = true WHERE id = $1`, [smsId]);
    return Response.json({
      ok: true, matched: false,
      reason: byName.rows.length === 0 ? "일치 건 없음 — 수동 확인" : "이름 복수 일치 — 수동 확인",
    });
  }

  // 완전일치 2건 이상: 동명·동액 충돌 → 수동
  await query(`UPDATE sms_inbound SET parsed_ok = true WHERE id = $1`, [smsId]);
  return Response.json({ ok: true, matched: false, reason: "복수 일치 — 수동 확인" });
}

export async function GET() {
  return Response.json({ ok: true, endpoint: "sms/inbound" });
}
