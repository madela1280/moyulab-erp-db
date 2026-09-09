// app/views/customerReception/extend-order/columns.ts
//
// 연장·연체료 그리드 컬럼 정의. payment_orders(order_type='extend') + unified 조인 결과를 보여준다.
// "확인"(체크박스)은 별도 고정 컬럼이라 여기 목록에는 없다(ExtendOrderGrid에서 항상 맨 앞에 그림).
// 반납접수 화면과 동일한 필드명(거래처분류/기기번호/제품/수취인명)을 쓰고, 입금확인 상태 배지는
// 포장재구매 화면과 동일한 방식을 재사용한다.

export type ExtendOrderColumnType = "text" | "status" | "datetime" | "settlementType" | "readonly";

export type ExtendOrderColumn = {
  key: string;
  label: string;
  width: number;
  type?: ExtendOrderColumnType; // 기본값 "text"
};

export type ExtendOrderRow = {
  id: string;
  unifiedId: number | null; // 통합관리 대여건 id — "전송" 시 n차연장 기록 대상
  status: string; // payment_orders.status 원본값('waiting' | 'matched' | 'confirmed' | 'expired' | 'canceled')
  orderedAt: string | null; // 접수일자(created_at)
  confirmedAt: string | null; // 입금일자(confirmed_at) — 아직 확정 전이면 null
  currentEndDate: string | null; // 접수 시점 종료일(YYYY-MM-DD) — 결제수단 판정에는 안 씀(is_overdue_settlement 사용)
  extendDays: number | null;
  expectedAmount: number | null; // 입금 예정액(amount)
  actualAmount: number | null; // 실입금액(문자로 받은 금액) — "확인필요" 상태일 때만 amount와 다름
  isOverdueSettlement: boolean; // 카카오에서 "연체료정산"으로 안내된 건인지 — 결제수단 라벨(계좌이체(연체료)) 판정
  unifiedSyncedAt: string | null; // 통합관리에 전송완료된 시각 — 있으면 "전송" 버튼 비활성화(중복전송 방지)
  data: Record<string, string>;
};

export const EXTEND_ORDER_COLUMNS: ExtendOrderColumn[] = [
  { key: "orderedAt", label: "접수일자", width: 130, type: "datetime" },
  { key: "confirmedAt", label: "입금일자", width: 130, type: "datetime" },
  { key: "status", label: "입금확인", width: 90, type: "status" },
  { key: "partner_category", label: "거래처분류", width: 110 },
  { key: "device_no", label: "기기번호", width: 100 },
  { key: "device_model", label: "제품", width: 100 },
  { key: "customer_name", label: "수취인명", width: 100 },
  { key: "phone1", label: "연락처", width: 130 },
  { key: "current_end_date", label: "종료일", width: 110 },
  { key: "extend_days", label: "연장일수", width: 90 },
  { key: "new_end_date", label: "새만기일", width: 110 },
  { key: "amount", label: "금액", width: 100 },
  { key: "actual_amount", label: "실입금액", width: 100, type: "readonly" },
  { key: "depositor_name", label: "입금자명", width: 100 },
  { key: "specialNote1", label: "특이사항1", width: 220 },
  { key: "settlementType", label: "구분", width: 90, type: "settlementType" },
  { key: "syncStatus", label: "전송완료", width: 130, type: "readonly" },
];

/** waiting → 입금대기 / matched(이름만 일치·금액 다름) → 확인필요 / confirmed → 입금확정 */
export function getPaymentStatusLabel(status: string): "입금대기" | "확인필요" | "입금확정" {
  if (status === "waiting") return "입금대기";
  if (status === "matched") return "확인필요";
  return "입금확정";
}

/** 통합관리 n차연장 결제수단 라벨. 카카오 대화에서 "연체료정산"으로 안내된 건만 구분 표시. */
export function getExtensionPaymentMethodLabel(isOverdueSettlement: boolean): string {
  return isOverdueSettlement ? "계좌이체(연체료)" : "계좌이체";
}

/** "구분" 컬럼 표시값. 카카오에서 "연체료정산"으로 안내된 건은 연체료, 그 외(연장접수)는 연장. */
export function getSettlementTypeLabel(isOverdueSettlement: boolean): "연체료" | "연장" {
  return isOverdueSettlement ? "연체료" : "연장";
}

/** 날짜만 표시(시간 없음). API가 이미 date를 text로 캐스트해서 주지만, 방어적으로 한 번 더 자른다. */
export function formatDateOnly(v: string | null): string {
  if (!v) return "-";
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : String(v);
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

/** Grid 렌더링/복사(clipboard)에서 공용으로 쓰는 셀 표시값 — 읽기전용 컬럼(status/datetime)은 row.data가 아니라 row 자체에서 계산해서 보여준다. */
export function getCellDisplayValue(row: ExtendOrderRow, col: ExtendOrderColumn): string {
  if (col.type === "status") return getPaymentStatusLabel(row.status);
  if (col.type === "settlementType") return getSettlementTypeLabel(row.isOverdueSettlement);
  if (col.key === "orderedAt") return formatDateTime(row.orderedAt);
  if (col.key === "confirmedAt") return formatDateTime(row.confirmedAt);
  if (col.key === "new_end_date" || col.key === "current_end_date") return formatDateOnly(row.data?.[col.key] ?? "");
  if (col.key === "actual_amount") return row.actualAmount != null ? row.actualAmount.toLocaleString("ko-KR") : "-";
  if (col.key === "syncStatus") return row.unifiedSyncedAt ? `전송완료 (${formatDateTime(row.unifiedSyncedAt)})` : "-";
  return row.data?.[col.key] ?? "";
}

export function createEmptyExtendOrderRow(index: number): ExtendOrderRow {
  return {
    id: `empty-${index}`,
    unifiedId: null,
    status: "waiting",
    orderedAt: null,
    confirmedAt: null,
    currentEndDate: null,
    extendDays: null,
    expectedAmount: null,
    actualAmount: null,
    isOverdueSettlement: false,
    unifiedSyncedAt: null,
    data: {},
  };
}
