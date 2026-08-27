// app/views/customerReception/packaging-order/columns.ts
//
// 포장재구매 그리드 컬럼 정의. 카카오 챗봇이 받은 원본 정보 그대로 보여준다.
// "확인"(체크박스)은 별도 고정 컬럼이라 여기 목록에는 없다(PackagingOrderGrid에서 항상 맨 앞에 그림).

export type PackagingOrderColumnType = "text" | "status" | "datetime" | "checknote";

export type PackagingOrderColumn = {
  key: string;
  label: string;
  width: number;
  type?: PackagingOrderColumnType; // 기본값 "text"
};

export type PackagingOrderRow = {
  id: string;
  status: string; // payment_orders.status 원본값('waiting' | 'matched' | 'confirmed' | 'expired' | 'canceled')
  orderedAt: string | null; // 주문일자(created_at)
  confirmedAt: string | null; // 입금일자(confirmed_at) — 아직 확정 전이면 null
  expectedAmount: number | null; // 입금 예정액(amount)
  actualAmount: number | null; // 실입금액(문자로 받은 금액) — "확인필요" 상태일 때만 amount와 다름
  data: Record<string, string>;
};

export const PACKAGING_ORDER_COLUMNS: PackagingOrderColumn[] = [
  { key: "orderedAt", label: "주문일자", width: 130, type: "datetime" },
  { key: "confirmedAt", label: "입금일자", width: 130, type: "datetime" },
  { key: "status", label: "입금확인", width: 90, type: "status" },
  { key: "renter_name", label: "대여자명", width: 110 },
  { key: "phone1", label: "연락처1", width: 130 },
  { key: "phone2", label: "연락처2", width: 130 },
  { key: "shipping_address", label: "발송주소", width: 320 },
  { key: "item_name", label: "품목명", width: 160 },
  // 여기부터는 카톡 데이터가 아니라 직접 채워 넣는 칸(반납회수와 동일한 구성) — 롯데택배에 복사해 붙여넣기 위함
  { key: "pickupDate", label: "출고일자", width: 140 },
  { key: "boxCount", label: "박스수량", width: 90 },
  { key: "memo", label: "메모", width: 260 },
  { key: "checkNote", label: "체크사항", width: 220, type: "checknote" },
];

export const DEFAULT_BOX_COUNT = "1";
export const DEFAULT_MEMO = "방문전 연락 부탁드립니다. 안전하게 잘 부탁드립니다.";

/** waiting → 입금대기 / matched(이름만 일치·금액 다름) → 확인필요 / confirmed → 입금확정 */
export function getPaymentStatusLabel(status: string): "입금대기" | "확인필요" | "입금확정" {
  if (status === "waiting") return "입금대기";
  if (status === "matched") return "확인필요";
  return "입금확정";
}

/** "확인필요" 상태일 때 예정액/실입금액 차이를 보여줄 문구. 그 외엔 빈 문자열. */
export function buildCheckNote(row: Pick<PackagingOrderRow, "status" | "expectedAmount" | "actualAmount">): string {
  if (getPaymentStatusLabel(row.status) !== "확인필요") return "";
  if (row.expectedAmount == null || row.actualAmount == null) return "";
  return `예정 ${row.expectedAmount.toLocaleString("ko-KR")}원 / 실입금 ${row.actualAmount.toLocaleString("ko-KR")}원`;
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
export function getCellDisplayValue(row: PackagingOrderRow, col: PackagingOrderColumn): string {
  if (col.type === "status") return getPaymentStatusLabel(row.status);
  if (col.key === "orderedAt") return formatDateTime(row.orderedAt);
  if (col.key === "confirmedAt") return formatDateTime(row.confirmedAt);
  if (col.type === "checknote") return buildCheckNote(row);
  return row.data?.[col.key] ?? "";
}

export function createEmptyPackagingOrderRow(index: number): PackagingOrderRow {
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
