import type { AggregatePeriodMeta } from "@/aggregate/run/types.aggregateResult";
import type { DeviceCellValue } from "@/aggregate/result/AggregateResultTableByDevice";

export type DeviceRentKind = "구매" | "렌탈" | "";

export type DeviceBottomSourceItem = {
  rentKind: DeviceRentKind;
  values: Record<string, DeviceCellValue>;
};

export type DeviceBottomTotalsResult = {
  purchase: {
    values: Record<string, DeviceCellValue>;
    sum: DeviceCellValue;
  };
  rental: {
    values: Record<string, DeviceCellValue>;
    sum: DeviceCellValue;
  };
  total: {
    values: Record<string, DeviceCellValue>;
    sum: DeviceCellValue;
  };
};

function toSafeNumber(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function emptyCell(): DeviceCellValue {
  return { 출고: 0, 대여일수: 0, 금액: 0 };
}

function clonePeriodValues(periods: AggregatePeriodMeta[]) {
  const out: Record<string, DeviceCellValue> = {};
  for (const p of periods) out[p.key] = emptyCell();
  return out;
}

function addCell(a: DeviceCellValue, b: DeviceCellValue | undefined) {
  a.출고 += toSafeNumber(b?.출고);
  a.대여일수 += toSafeNumber(b?.대여일수);
  a.금액 += toSafeNumber(b?.금액);
}

function calcSum(values: Record<string, DeviceCellValue>, periods: AggregatePeriodMeta[]) {
  const s = emptyCell();
  for (const p of periods) addCell(s, values[p.key]);
  return s;
}

function buildBucket(periods: AggregatePeriodMeta[]) {
  const values = clonePeriodValues(periods);
  return {
    values,
    sum: emptyCell(),
  };
}

export function buildDeviceBottomTotals(args: {
  periods: AggregatePeriodMeta[];
  items: DeviceBottomSourceItem[];
}): DeviceBottomTotalsResult {
  const periods = args.periods || [];
  const items = args.items || [];

  const purchase = buildBucket(periods);
  const rental = buildBucket(periods);
  const total = buildBucket(periods);

  for (const item of items) {
    const kind = item.rentKind || "";

    for (const p of periods) {
      const v = item.values?.[p.key];

      addCell(total.values[p.key], v);

      if (kind === "구매") addCell(purchase.values[p.key], v);
      if (kind === "렌탈") addCell(rental.values[p.key], v);
    }
  }

  purchase.sum = calcSum(purchase.values, periods);
  rental.sum = calcSum(rental.values, periods);
  total.sum = calcSum(total.values, periods);

  return { purchase, rental, total };
}