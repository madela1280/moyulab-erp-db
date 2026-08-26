// app/api/sms/inbound/route.ts
//
// 입금 문자 수신 → 파싱 → payment_orders 매칭
//
// 폰의 문자 자동전달 앱(SMS Forwarder 등)이 이 주소로 POST 합니다.
//   URL:    https://moulab.kr/api/sms/inbound
//   헤더:   x-sms-secret: (환경변수 SMS_INBOUND_SECRET 값)
//   본문:   { "text": "문자 원문" }   또는 text/plain 원문 그대로
//
// 매칭 규칙 (지시서와 동일):
//   금액 일치 + 입금자명 일치 + waiting 1건  → status='matched'
//   그 외 (0건·2건 이상·이름 불일치)         → 원문만 보관, 직원 수동 처리
//
// ★ 'confirmed'로 바로 올리지 않습니다. 종료일 갱신·알림톡은 ERP [입금 확인]의
//   책임이므로, 파서는 "이 건이 맞다"까지만 표시(matched)하고 멈춥니다.
//   ERP 화면에서 matched 건은 강조 표시 + 원클릭 확인. (완전 자동 전환은
//   운영 안정 후 AUTO_CONFIRM 환경변수로 승격 — 이사님과 협의 후)

import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { parseDepositSms } from "@/api/kakao/_lib/sms-parse";

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
    `SELECT id FROM payment_orders
     WHERE status = 'waiting'
       AND amount = $1
       AND depositor_name = $2
       AND expires_at > now()
     ORDER BY created_at ASC`,
    [parsed.amount, parsed.depositor]
  );

  if (r.rows.length !== 1) {
    // 0건: 이름 다르게 입금(남편 명의 등) / 2건 이상: 동명·동액 충돌 → 수동
    await query(`UPDATE sms_inbound SET parsed_ok = true WHERE id = $1`, [smsId]);
    return Response.json({
      ok: true, matched: false,
      reason: r.rows.length === 0 ? "일치 건 없음 — 수동 확인" : "복수 일치 — 수동 확인",
    });
  }

  const orderId = r.rows[0].id;
  await query(
    `UPDATE payment_orders
     SET status = 'matched', memo = COALESCE(memo,'') || '[SMS자동매칭 ' || now()::date || '] '
     WHERE id = $1 AND status = 'waiting'`,
    [orderId]
  );
  await query(`UPDATE sms_inbound SET matched_id = $1 WHERE id = $2`, [orderId, smsId]);

  console.log("[SMS_MATCH]", JSON.stringify({ orderId, amount: parsed.amount }));
  return Response.json({ ok: true, matched: true, orderId });
}

export async function GET() {
  return Response.json({ ok: true, endpoint: "sms/inbound" });
}
