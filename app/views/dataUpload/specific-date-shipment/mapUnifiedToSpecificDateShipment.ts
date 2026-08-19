import {
  SPECIFIC_DATE_SHIPMENT_COLUMNS,
  type SpecificDateShipmentRow,
} from "@/views/dataUpload/specific-date-shipment/columns";
import type { SpecificDateShipmentUnifiedSourceRow } from "@/views/dataUpload/specific-date-shipment/serviceSpecificDateShipment";

// ✅ 국가 공휴일 목록 — moulab-customer-reception 서버(HOLIDAYS)와 동일 기준을 사용한다.
const HOLIDAYS = new Set([
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-03-02",
  "2026-05-05",
  "2026-05-25",
  "2026-08-17",
  "2026-09-24",
  "2026-09-25",
  "2026-09-28",
  "2026-10-05",
  "2026-10-09",
  "2026-12-25",
  "2027-01-01",
  "2027-02-08",
  "2027-02-09",
  "2027-02-10",
  "2027-03-01",
  "2027-05-05",
  "2027-05-13",
  "2027-08-16",
  "2027-09-14",
  "2027-09-15",
  "2027-09-16",
  "2027-10-04",
  "2027-10-11",
  "2027-12-27",
]);

function text(v: unknown) {
  return String(v ?? "").trim();
}

function makeEmptyData() {
  return SPECIFIC_DATE_SHIPMENT_COLUMNS.reduce<Record<string, string>>((acc, col) => {
    acc[col.key] = "";
    return acc;
  }, {});
}

function parseDateOnly(v: unknown): Date | null {
  const s = text(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;

  return new Date(y, mo - 1, d);
}

function formatDateOnly(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isBusinessDay(d: Date) {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !HOLIDAYS.has(formatDateOnly(d));
}

/*
 * ✅ 출고일자 계산 규칙: 시작일 기준 "영업일" 2일 전.
 * - 시작일부터 하루씩 거슬러 올라가면서 영업일(월~금, 공휴일 제외)만 세어 2일째 되는 날.
 * - (단순 "캘린더 -2일 후 보정"이 아님: 시작일 자체가 휴일이어도 정확히 계산됨.
 *   예) 토요일 시작→목요일 / 일요일 시작→목요일 / 연휴(9/24~27) 직후 9/28(월) 시작→9/22)
 */
export function computeShipmentDate(startDateText: unknown): string {
  const start = parseDateOnly(startDateText);
  if (!start) return "";

  const d = new Date(start);
  let remaining = 2;

  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    if (isBusinessDay(d)) {
      remaining -= 1;
    }
  }

  return formatDateOnly(d);
}

export function mapUnifiedToSpecificDateShipmentRows(
  sourceRows: SpecificDateShipmentUnifiedSourceRow[]
): SpecificDateShipmentRow[] {
  return (Array.isArray(sourceRows) ? sourceRows : []).map((source) => {
    const data = source?.data && typeof source.data === "object" ? source.data : {};
    const mapped = makeEmptyData();

    mapped.recipientName = text(data["수취인명"]);
    mapped.phone1 = text(data["연락처1"]);
    mapped.phone2 = text(data["연락처2"]);
    mapped.contractAddress = text(data["계약자주소"]);

    // ✅ 품목명 = "거래처분류/대여" (예: 상록 → "상록/대여"). "대여"는 모든 행에 동일하게 표시.
    const partnerCategory = text(data["거래처분류"]);
    mapped.itemName = partnerCategory ? `${partnerCategory}/대여` : "대여";

    // ✅ 택배발송일은 항상 빈 값에서 시작(수기 입력 전용). 이 값이 전송 시 통합관리 택배발송일에 저장됨.
    mapped.shippingDate = "";

    mapped.startDate = text(data["시작일"]);
    mapped.shipmentDate = computeShipmentDate(data["시작일"]);
    mapped.boxCount = "";
    mapped.zipCode = "";
    mapped.blankX1 = "";
    mapped.blankX2 = "";
    mapped.blankX3 = "";
    mapped.memo = "";
    mapped.originalInvoiceNo = "";

    // ✅ 전송 시 통합관리 행을 특정하기 위한 숨김 필드(화면/CSV에는 노출 안 됨)
    mapped.__unifiedId = String(source.id);

    return {
      id: `unified-${source.id}`,
      checked: false,
      data: mapped,
    };
  });
}
