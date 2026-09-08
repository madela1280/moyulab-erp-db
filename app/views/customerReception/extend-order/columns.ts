// app/views/customerReception/extend-order/columns.ts
//
// 연장·연체료 그리드 컬럼 정의. payment_orders(order_type='extend') + unified 조인 결과를 보여준다.
// "확인"(체크박스)은 별도 고정 컬럼이라 여기 목록에는 없다(ExtendOrderGrid에서 항상 맨 앞에 그림).
// 포장재구매(packaging-order/columns.ts)와 동일한 구조 — 입금확인 상태 배지도 그대로 재사용한다.

export type ExtendOrderColumnType = "text" | "status" | "datetime" | "checknote";

export type ExtendOrderColumn = {
  key: string;
  label: string;
  width: number;
  type?: ExtendOrderColumnType; // 기본값 "text"
};

export type ExtendOrderRow = {
  id: string;
  status: string; // payment_orders.status 원본값('waiting' | 'matched' | 'confirmed' | 'expired' | 'canceled')
  orderedAt: string | null; // 접수일자(created_at)
  confirmedAt: string | null; // 입금일자(confirmed_at) — 아직 확정 전이면 null
  expectedAmount: number | null; // 입금 예정액(amount)
  actualAmount: number | null; // 실입금액(문자로 받은 금액) — "확인필요" 상태일 때만 amount와 다름
  data: Record<string, string>;
};

export const EXTEND_ORDER_COLUMNS: ExtendOrderColumn[] = [
  { key: "orderedAt", label: "접수일자", width: 130, type: "datetime" },
  { key: "confirmedAt", label: "입금일자", width: 130, type: "datetime" },
  { key: "status", label: "입금확인", width: 90, type: "status" },
  { key: "customer_name", label: "대여자명", width: 100 },
  { key: "phone1", label: "연락처", width: 130 },
  { key: "device_model", label: "대여기종", width: 100 },
  { key: "partner_category", label: "대여처", width: 110 },
  { key: "extend_days", label: "연장일수", width: 90 },
  { key: "new_end_date", label: "새만기일", width: 110 },
  { key: "amount", label: "금액", width: 100 },
  { key: "depositor_name", label: "입금자명", width: 100 },
  { key: "memo", label: "메모", width: 220, type: "checknote" },
];

/** waiting → 입금대기 / matched(이름만 일치·금액 다름) → 확인필요 / confirmed → 입금확정 */
export function getPaymentStatusLabel(status: string): "입금대기" | "확인필요" | "입금확정" {
  if (status === "waiting") return "입금대기";
  if (status === "matched") return "확인필요";
  return "입금확정";
}

/** 입금자명이 대여자(수취인)명과 다르면 메모로 표시 — 대신 입금해준 경우를 놓치지 않기 위함 */
export function buildMemoNote(row: Pick<ExtendOrderRow, "data">): string {
  const customerName = (row.data?.customer_name ?? "").trim();
  const depositorName = (row.data?.depositor_name ?? "").trim();
  if (!customerName || !depositorName) return "";
  if (customerName === depositorName) return "";
  return `실입금자: ${depositorName}`;
}

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

/** Grid 렌더링/복사(clipboard)에서 공용으로 쓰는 셀 표시값 — 읽기전용 컬럼(status/datetime/checknote)은 row.data가 아니라 row 자체에서 계산해서 보여준다. */
export function getCellDisplayValue(row: ExtendOrderRow, col: ExtendOrderColumn): string {
  if (col.type === "status") return getPaymentStatusLabel(row.status);
  if (col.key === "orderedAt") return formatDateTime(row.orderedAt);
  if (col.key === "confirmedAt") return formatDateTime(row.confirmedAt);
  if (col.type === "checknote") return buildMemoNote(row);
  return row.data?.[col.key] ?? "";
}

export function createEmptyExtendOrderRow(index: number): ExtendOrderRow {
  return {
    id: `empty-${index}`,
    status: "waiting",
    orderedAt: null,
    confirmedAt: null,
    expectedAmount: null,
    actualAmount: null,
    data: {},
  };
}
