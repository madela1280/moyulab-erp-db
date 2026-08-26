// app/customerReception/payment-confirm/types.ts
//
// 고객접수 > 입금확인 화면 타입. payment_orders + unified 조인 결과 그대로.

export type PaymentOrderType = "extend" | "overdue" | "parts";
export type PaymentOrderStatus = "waiting" | "matched" | "confirmed" | "expired" | "canceled";

export type PaymentOrderRow = {
  id: number;
  order_type: PaymentOrderType;

  received_at: string; // 접수 시각(ISO)

  // 연장·연체료: unified 조인 표시용 / 포장재구매: payment_orders에 저장된 값 그대로
  customer_name: string | null; // 고객명
  device_model: string | null; // 기종(포장재구매는 구매품목)
  partner_category: string | null; // 대여처(거래처분류)

  // extend 전용(overdue·parts는 null)
  extend_days: number | null;
  new_end_date: string | null;

  amount: number; // 입금 예정 금액
  depositor_name: string | null; // 입금자명

  status: PaymentOrderStatus; // waiting: 입금대기 / matched: 문자로 매칭돼 확인 대기
  expires_at: string; // ISO, 대기 만료 기준
};
