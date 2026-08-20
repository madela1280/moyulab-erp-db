// app/customerReception/payment-confirm/types.ts
//
// 고객접수 > 입금확인 화면 타입.
// ⚠ payment_orders 테이블은 아직 생성 전(껍데기 단계) — 실제 API 연동 전까지는 항상 빈 배열로 사용.

export type PaymentOrderType = "extend" | "overdue";

export type PaymentOrderRow = {
  id: number;
  order_type: PaymentOrderType;

  received_at: string; // 접수 시각(ISO)

  // unified 조인 표시용
  customer_name: string | null; // 고객명
  device_model: string | null; // 기종
  partner_category: string | null; // 대여처(거래처분류)

  // extend 전용(overdue는 null)
  extend_days: number | null;
  new_end_date: string | null;

  amount: number; // 입금 예정 금액
  depositor_name: string | null; // 입금자명

  status: "waiting" | "confirmed" | "expired" | "canceled";
  expires_at: string; // ISO, 대기 만료 기준
};
