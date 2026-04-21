import type {
  AggregatePeriodMeta,
  AggregateResultRow,
  AggregateDeviceRow,
} from "@/aggregate/run/types.aggregateResult";
import type {
  PartnerAllRow,
  PartnerAllCell,
  PartnerAllSection,
} from "./types.partnerAll";

function n(v: number | null | undefined) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function emptyCell(): PartnerAllCell {
  return { 출고: 0, 대여일수: 0, 금액: 0 };
}

function makeEmptyValues(periods: AggregatePeriodMeta[]) {
  const out: Record<string, PartnerAllCell> = {};
  for (const p of periods) out[p.key] = emptyCell();
  return out;
}

function addCell(a: PartnerAllCell, b: PartnerAllCell | undefined) {
  a.출고 += n(b?.출고);
  a.대여일수 += n(b?.대여일수);
  a.금액 += n(b?.금액);
}

function calcSum(values: Record<string, PartnerAllCell>, periods: AggregatePeriodMeta[]): PartnerAllCell {
  const s = emptyCell();
  for (const p of periods) addCell(s, values[p.key]);
  return s;
}

function toBucket(v: string): PartnerAllSection {
  const s = String(v ?? "").trim();
  if (s === "보건소" || s === "조리원" || s === "온라인" || s === "개인") return s;
  return "기타";
}

function buildFromResultRows(periods: AggregatePeriodMeta[], rows: AggregateResultRow[]): PartnerAllRow[] {
  const out: PartnerAllRow[] = [];
  const bucketOrder: PartnerAllSection[] = ["보건소", "조리원", "온라인", "개인", "기타"];

  const byBucket = new Map<PartnerAllSection, AggregateResultRow[]>();
  for (const r of rows || []) {
    if (r.partnerCategory === "소계") continue;
    const b = toBucket(r.partnerCategory);
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b)!.push(r);
  }

  for (const bucket of bucketOrder) {
    const list = (byBucket.get(bucket) || []).slice();
    if (!list.length) continue;

    list.forEach((r, idx) => {
      out.push({
        rowType: "data",
        section: bucket,
        label: String(r.pumpModel ?? ""),
        values: (r.values as Record<string, PartnerAllCell>) || makeEmptyValues(periods),
        sum: (r.sum as PartnerAllCell) || emptyCell(),
        showSection: idx === 0,
      });
    });

    const subtotalValues = makeEmptyValues(periods);
    for (const r of list) {
      for (const p of periods) addCell(subtotalValues[p.key], r.values?.[p.key] as PartnerAllCell);
    }

    out.push({
      rowType: "subtotal",
      section: bucket,
      label: `${bucket} 소계`,
      values: subtotalValues,
      sum: calcSum(subtotalValues, periods),
      showSection: true,
    });
  }

  const grandValues = makeEmptyValues(periods);
  for (const r of out) {
    for (const p of periods) addCell(grandValues[p.key], r.values?.[p.key]);
  }

  out.push({
    rowType: "grandTotal",
    section: "합계",
    label: "합계",
    values: grandValues,
    sum: calcSum(grandValues, periods),
    showSection: true,
  });

  return out;
}

function buildFromDeviceRows(periods: AggregatePeriodMeta[], deviceRows: AggregateDeviceRow[]): PartnerAllRow[] {
  const out: PartnerAllRow[] = [];
  const bucketOrder: PartnerAllSection[] = ["보건소", "조리원", "온라인", "개인", "기타"];

  const grouped = new Map<string, Record<string, PartnerAllCell>>();

  for (const d of deviceRows || []) {
    const bucket = toBucket(d.partnerCategory);
    const keyLabel =
      bucket === "보건소" || bucket === "조리원"
        ? String(d.partnerCategory || "").trim()
        : String(d.pumpModel || "").trim();

    const gKey = `${bucket}||${keyLabel || "-"}`;
    if (!grouped.has(gKey)) grouped.set(gKey, makeEmptyValues(periods));

    const values = grouped.get(gKey)!;
    for (const p of periods) addCell(values[p.key], d.values?.[p.key] as PartnerAllCell);
  }

  for (const bucket of bucketOrder) {
    const rowsInBucket = Array.from(grouped.entries())
      .filter(([k]) => k.startsWith(`${bucket}||`))
      .map(([k, values]) => {
        const label = k.split("||")[1] || "-";
        return {
          rowType: "data" as const,
          section: bucket,
          label,
          values,
          sum: calcSum(values, periods),
          showSection: false,
        };
      });

    if (!rowsInBucket.length) continue;

    rowsInBucket.forEach((r, idx) => (r.showSection = idx === 0));
    out.push(...rowsInBucket);

    const subtotalValues = makeEmptyValues(periods);
    for (const r of rowsInBucket) for (const p of periods) addCell(subtotalValues[p.key], r.values[p.key]);

    out.push({
      rowType: "subtotal",
      section: bucket,
      label: `${bucket} 소계`,
      values: subtotalValues,
      sum: calcSum(subtotalValues, periods),
      showSection: true,
    });
  }

  const grandValues = makeEmptyValues(periods);
  for (const r of out) for (const p of periods) addCell(grandValues[p.key], r.values[p.key]);

  out.push({
    rowType: "grandTotal",
    section: "합계",
    label: "합계",
    values: grandValues,
    sum: calcSum(grandValues, periods),
    showSection: true,
  });

  return out;
}

export function buildPartnerAllRows(args: {
  periods: AggregatePeriodMeta[];
  rows: AggregateResultRow[];
  deviceRows?: AggregateDeviceRow[];
}) {
  const periods = args.periods || [];
  const rows = args.rows || [];
  const deviceRows = args.deviceRows || [];

  if (deviceRows.length > 0) {
    return buildFromDeviceRows(periods, deviceRows);
  }

  return buildFromResultRows(periods, rows);
}