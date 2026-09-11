// app/views/customerReception/refund-request/columns.ts
//
// 환불접수 그리드 컬럼 정의. 데이터는 CS서버 자기 DB(refund_requests)에서 옴(반납접수와 동일
// 원칙). "확인"(체크박스)은 별도 고정 컬럼이라 여기 목록에는 없다.

export type RefundRequestColumnType = "text" | "datetime" | "select";

export type RefundRequestColumn = {
  key: string;
  label: string;
  width: number;
  type?: RefundRequestColumnType; // 기본값 "text"
};

export const PAYMENT_STATUS_OPTIONS = ["반품전", "입금전", "입금완료"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS_OPTIONS)[number];

export type RefundRequestRow = {
  id: string;
  receivedAt: string | null;
  data: Record<string, string>;
};

export const REFUND_REQUEST_COLUMNS: RefundRequestColumn[] = [
  { key: "receivedAt", label: "접수일자", width: 130, type: "datetime" },
  { key: "partner_category", label: "거래처분류", width: 100 },
  { key: "device_no", label: "기기번호", width: 100 },
  { key: "product", label: "제품", width: 100 },
  { key: "renter_name", label: "수취인명", width: 100 },
  { key: "phone", label: "연락처1", width: 130 },
  { key: "contract_address", label: "계약자주소", width: 220 },
  { key: "start_date", label: "시작일", width: 100 },
  { key: "end_date", label: "종료일", width: 100 },
  { key: "pickup_preferred_date", label: "반납요청일", width: 100 },
  { key: "refund_amount", label: "환불금액", width: 100 },
  { key: "bank_name", label: "은행명", width: 100 },
  { key: "account_holder", label: "예금주명", width: 90 },
  { key: "account_number", label: "계좌번호", width: 160 },
  { key: "payment_status", label: "입금", width: 90, type: "select" },
  { key: "parts_note", label: "추가반품", width: 180 },
  { key: "memo", label: "메모", width: 200 },
];

export function formatDateTime(v: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function getCellDisplayValue(row: RefundRequestRow, col: RefundRequestColumn): string {
  if (col.key === "receivedAt") return formatDateTime(row.receivedAt);
  return row.data?.[col.key] ?? "";
}

export function createEmptyRefundRequestRow(index: number): RefundRequestRow {
  return { id: `empty-${index}`, receivedAt: null, data: {} };
}
