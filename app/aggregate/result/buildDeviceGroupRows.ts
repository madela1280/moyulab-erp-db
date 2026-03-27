import type { AggregatePeriodMeta } from "@/aggregate/run/types.aggregateResult";
import type {
  DeviceResultBlock,
  DeviceResultRow,
  DeviceCellValue,
} from "@/aggregate/result/AggregateResultTableByDevice";

type RawDeviceAggItem = {
  pumpModel: string;
  partnerCategory: string;
  deviceNo: string;
  rentKind?: "구매" | "렌탈" | "";
  values: Record<string, DeviceCellValue>;
};

type BuildDeviceGroupRowsInput = {
  periods: AggregatePeriodMeta[];
  items: RawDeviceAggItem[];
  pumpOrder?: string[];
  partnerOrder?: string[];
};

const DEFAULT_PARTNER_ORDER = ["온라인", "보건소", "조리원", "개인", "기타", "미출고"];

function normalizePumpModelName(name: string) {
  const s = String(name ?? "").trim();

  if (s.includes("심포니")) return "심포니";
  if (s.includes("락티나")) return "락티나";
  if (s.includes("스윙맥") || s.includes("스윙맥시") || s.includes("스윙맥스")) return "스윙맥시";
  if (s.includes("프리스타일")) return "프리스타일";
  if (s.includes("스윙")) return "스윙";
  if (s.includes("시밀래") || s.includes("시밀레")) return "시밀래";
  if (s.includes("각시밀")) return "각시밀";

  return s || "미지정";
}

function emptyCell(): DeviceCellValue {
  return { 출고: 0, 대여일수: 0, 금액: 0 };
}

function cloneEmptyValues(periods: AggregatePeriodMeta[]) {
  const out: Record<string, DeviceCellValue> = {};
  for (const p of periods) out[p.key] = emptyCell();
  return out;
}

function addCell(a: DeviceCellValue, b: DeviceCellValue) {
  a.출고 += Number(b?.출고 ?? 0);
  a.대여일수 += Number(b?.대여일수 ?? 0);
  a.금액 += Number(b?.금액 ?? 0);
}

function calcSum(values: Record<string, DeviceCellValue>, periods: AggregatePeriodMeta[]) {
  const s = emptyCell();
  for (const p of periods) {
    addCell(s, values[p.key] || emptyCell());
  }
  return s;
}

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function makeDeviceRow(
  periods: AggregatePeriodMeta[],
  partnerCategory: string,
  deviceNo: string,
  values: Record<string, DeviceCellValue>
): DeviceResultRow {
  return {
    rowType: "device",
    partnerCategory,
    deviceNo,
    values,
    sum: calcSum(values, periods),
  };
}

function makeSubtotalRow(
  periods: AggregatePeriodMeta[],
  partnerCategory: string,
  sourceRows: DeviceResultRow[]
): DeviceResultRow {
  const values = cloneEmptyValues(periods);
  for (const r of sourceRows) {
    for (const p of periods) addCell(values[p.key], r.values[p.key] || emptyCell());
  }
  return {
    rowType: "subtotal",
    partnerCategory,
    deviceNo: "소계",
    values,
    sum: calcSum(values, periods),
  };
}

function makeGrandTotalRow(periods: AggregatePeriodMeta[], sourceRows: DeviceResultRow[]): DeviceResultRow {
  const values = cloneEmptyValues(periods);
  for (const r of sourceRows) {
    if (r.rowType !== "device" && r.rowType !== "subtotal") continue;
    if (r.rowType === "subtotal") continue;
    for (const p of periods) addCell(values[p.key], r.values[p.key] || emptyCell());
  }
  return {
    rowType: "grandTotal",
    partnerCategory: "합계",
    deviceNo: "합계",
    values,
    sum: calcSum(values, periods),
  };
}

function makeBottomRow(
  periods: AggregatePeriodMeta[],
  rowType: "bottomPurchase" | "bottomRental" | "bottomSum",
  sourceItems: RawDeviceAggItem[]
): DeviceResultRow {
  const values = cloneEmptyValues(periods);
  for (const it of sourceItems) {
    for (const p of periods) addCell(values[p.key], it.values[p.key] || emptyCell());
  }
  return {
    rowType,
    partnerCategory: "",
    deviceNo: "",
    values,
    sum: calcSum(values, periods),
  };
}

export function buildDeviceGroupRows(input: BuildDeviceGroupRowsInput): DeviceResultBlock[] {
  const periods = input.periods || [];
  const partnerOrder = input.partnerOrder && input.partnerOrder.length > 0 ? input.partnerOrder : DEFAULT_PARTNER_ORDER;

  const normalizedItems: RawDeviceAggItem[] = (input.items || []).map((it) => ({
    pumpModel: normalizePumpModelName(it.pumpModel),
    partnerCategory: normalizeText(it.partnerCategory) || "기타",
    deviceNo: normalizeText(it.deviceNo) || "-",
    rentKind: it.rentKind === "구매" || it.rentKind === "렌탈" ? it.rentKind : "",
    values: it.values || {},
  }));

  const pumpSet = new Set<string>();
  for (const it of normalizedItems) pumpSet.add(it.pumpModel);

  const pumpOrder =
    input.pumpOrder && input.pumpOrder.length > 0
      ? input.pumpOrder
          .map((x) => normalizePumpModelName(x))
          .filter((x, idx, arr) => arr.indexOf(x) === idx)
          .filter((x) => pumpSet.has(x))
      : Array.from(pumpSet).sort((a, b) => a.localeCompare(b, "ko"));

  const blocks: DeviceResultBlock[] = [];

  for (const pump of pumpOrder) {
    const pumpItems = normalizedItems.filter((x) => x.pumpModel === pump);
    const rows: DeviceResultRow[] = [];

    for (const partner of partnerOrder) {
      const partnerItems = pumpItems.filter((x) => x.partnerCategory === partner);
      if (partnerItems.length === 0) continue;

      const deviceRows = partnerItems
        .slice()
        .sort((a, b) => a.deviceNo.localeCompare(b.deviceNo, "ko"))
        .map((it) => makeDeviceRow(periods, partner, it.deviceNo, it.values));

      rows.push(...deviceRows);
      rows.push(makeSubtotalRow(periods, partner, deviceRows));
    }

    // partnerOrder에 없던 거래처도 뒤에 붙임
    const extraPartners = Array.from(
      new Set(
        pumpItems
          .map((x) => x.partnerCategory)
          .filter((p) => partnerOrder.indexOf(p) < 0)
      )
    ).sort((a, b) => a.localeCompare(b, "ko"));

    for (const partner of extraPartners) {
      const partnerItems = pumpItems.filter((x) => x.partnerCategory === partner);
      const deviceRows = partnerItems
        .slice()
        .sort((a, b) => a.deviceNo.localeCompare(b.deviceNo, "ko"))
        .map((it) => makeDeviceRow(periods, partner, it.deviceNo, it.values));

      rows.push(...deviceRows);
      rows.push(makeSubtotalRow(periods, partner, deviceRows));
    }

    rows.push(makeGrandTotalRow(periods, rows));

    // 심포니/락티나 전용: 맨아래 구매/렌탈만 표시(합계 중복 제거)
    if (pump.includes("심포니") || pump.includes("락티나")) {
      const purchaseItems = pumpItems.filter((x) => x.rentKind === "구매");
      const rentalItems = pumpItems.filter((x) => x.rentKind === "렌탈");

      rows.push(makeBottomRow(periods, "bottomPurchase", purchaseItems));
      rows.push(makeBottomRow(periods, "bottomRental", rentalItems));
    }

    blocks.push({
      pumpModel: pump,
      rows,
    });
  }

  return blocks;
}