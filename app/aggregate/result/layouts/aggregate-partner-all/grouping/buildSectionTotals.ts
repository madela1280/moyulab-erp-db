import type { AggregatePeriodMeta } from "@/aggregate/run/types.aggregateResult";
import type { PartnerAllCell, PartnerAllRow, PartnerAllSection } from "../types.partnerAll";

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

export function buildSectionTotals(args: {
  periods: AggregatePeriodMeta[];
  rows: PartnerAllRow[];
  section: PartnerAllSection;
}) {
  const periods = args.periods || [];
  const rows = args.rows || [];
  const section = args.section;

  const values = makeEmptyValues(periods);

  for (const r of rows) {
    if (r.section !== section) continue;
    if (r.rowType !== "data") continue;

    for (const p of periods) addCell(values[p.key], r.values?.[p.key]);
  }

  return {
    rowType: "subtotal" as const,
    section,
    label: `${section} 소계`,
    values,
    sum: calcSum(values, periods),
    showSection: true,
  };
}