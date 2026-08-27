// app/lib/alimtalk/paymentConfirmAlimtalk.ts
//
// SMS 자동매칭으로 payment_orders가 즉시 confirmed 될 때(이름+금액 완전일치) 고객에게 보내는
// "입금확인" 알림톡. "확인필요"(matched, 금액 다름) 상태는 아직 확정이 아니므로 여기서 보내지 않는다.
//
// NCP SENS Bizmessage 승인 템플릿 — 채널 @메델라유축기 / 템플릿코드 paymentconfirm01:
//   입금이 확인되었습니다.
//
//   주문내용: #{주문내용}
//   입금액: #{입금액}원
//   입금자명: #{입금자명}
//
//   #{안내문구}
//
// 필요 환경변수(승인 전엔 비워둬도 됨 — 없으면 조용히 skip):
//   NCLOUD_SENS_BIZ_SERVICE_ID          (기존 SMS 발송과 동일한 SENS 서비스 ID 재사용)
//   ALIMTALK_PAYMENT_CONFIRM_PLUS_FRIEND_ID  (NCP 콘솔에 등록된 채널 ID — 정확한 형식은 콘솔에서 확인 필요)
//   ALIMTALK_PAYMENT_CONFIRM_TEMPLATE_CODE   (예: paymentconfirm01)
//
// 발송 실패해도 SMS 매칭 자체(이미 DB에 confirmed로 저장 완료)는 막지 않는다 — 여기서 던지지 않고 로그만 남긴다.

import { query } from "@/lib/db";
import { sendAlimTalk } from "@/lib/sens";

const TEMPLATE = `입금이 확인되었습니다.

주문내용: #{주문내용}
입금액: #{입금액}원
입금자명: #{입금자명}

#{안내문구}`;

export type PaymentOrderForAlimtalk = {
  id: number;
  order_type: "extend" | "overdue" | "parts";
  amount: number;
  depositor_name: string | null;
  phone1: string | null;
  item_name: string | null;
  extend_days: number | null;
  new_end_date: string | null;
};

function onlyDigitsPhone(v: unknown) {
  return String(v ?? "").replace(/[^\d]/g, "");
}

function toYmd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function isNonBizDay(d: Date): Promise<boolean> {
  const day = d.getDay(); // 0=일, 6=토
  if (day === 0 || day === 6) return true;
  const r = await query(`SELECT 1 FROM holidays WHERE date = $1::date`, [toYmd(d)]);
  return (r.rows?.length ?? 0) > 0;
}

async function nextBizDayLabel(from: Date): Promise<string> {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (await isNonBizDay(d)) d.setDate(d.getDate() + 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 포장재구매: 평일 16시 이전 확정이면 금일 발송, 아니면 다음 영업일 발송 안내(주말·공휴일 건너뜀) */
async function buildPartsGuideText(): Promise<string> {
  const now = new Date();
  if (now.getHours() < 16 && !(await isNonBizDay(now))) {
    return "포장재를 오늘 발송해드리겠습니다.";
  }
  return `포장재를 ${await nextBizDayLabel(now)}에 발송해드리겠습니다.`;
}

function buildOrderContent(order: PaymentOrderForAlimtalk): string {
  if (order.order_type === "parts") return order.item_name || "포장재구매";
  if (order.order_type === "extend") {
    const days = order.extend_days != null ? `${order.extend_days}일` : "";
    const end = order.new_end_date ? ` (새 만기일 ${order.new_end_date})` : "";
    return `대여기간 연장 ${days}${end}`.trim();
  }
  return "연체료 정산";
}

export async function sendPaymentConfirmAlimtalk(order: PaymentOrderForAlimtalk) {
  try {
    const serviceId = process.env.NCLOUD_SENS_BIZ_SERVICE_ID;
    const plusFriendId = process.env.ALIMTALK_PAYMENT_CONFIRM_PLUS_FRIEND_ID;
    const templateCode = process.env.ALIMTALK_PAYMENT_CONFIRM_TEMPLATE_CODE;

    if (!serviceId || !plusFriendId || !templateCode) {
      console.log("[ALIMTALK_SKIP] env not set yet — waiting on template approval/설정");
      return;
    }

    const to = onlyDigitsPhone(order.phone1);
    if (!to) {
      console.error("[ALIMTALK_SKIP] missing phone1", order.id);
      return;
    }

    const guideText =
      order.order_type === "parts" ? await buildPartsGuideText() : "정상적으로 처리되었습니다.";

    const content = TEMPLATE.replace("#{주문내용}", buildOrderContent(order))
      .replace("#{입금액}", order.amount.toLocaleString("ko-KR"))
      .replace("#{입금자명}", order.depositor_name ?? "-")
      .replace("#{안내문구}", guideText);

    const resp = await sendAlimTalk({
      serviceId,
      plusFriendId,
      templateCode,
      messages: [{ to, content }],
    });

    console.log("[ALIMTALK_SENT]", JSON.stringify({ orderId: order.id, requestId: resp?.requestId }));
  } catch (e: any) {
    console.error("[ALIMTALK_FAIL]", order.id, e?.message ?? e);
  }
}
