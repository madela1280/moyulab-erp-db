import type { AggregatePeriodMeta, AggregateDeviceRow } from "@/aggregate/run/types.aggregateResult";
import type { PartnerAllCell, PartnerAllSection } from "../types.partnerAll";

type GroupedItem = {
  section: PartnerAllSection;
  label: string;
  values: Record<string, PartnerAllCell>;
};

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

function toSection(v: string): PartnerAllSection {
  const s = String(v ?? "").trim();
  if (s === "보건소" || s === "조리원" || s === "온라인" || s === "개인") return s;
  return "기타";
}

/**
 * 거래처=전체 규칙
 * - 보건소/조리원: 거래처별
 * - 온라인/개인: 기기(여기서는 pumpModel)별
 * - 기타: 통합 1행
 */
export function groupByPartnerOrDevice(args: {
  periods: AggregatePeriodMeta[];
  deviceRows: AggregateDeviceRow[];
}) {
  const periods = args.periods || [];
  const deviceRows = args.deviceRows || [];

  const map = new Map<string, GroupedItem>();

  for (const d of deviceRows) {
    const section = toSection(d.partnerCategory);
    const partner = String(d.partnerCategory ?? "").trim();
    const pumpModel = String(d.pumpModel ?? "").trim();

    const label =
      section === "보건소" || section === "조리원"
        ? partner || "-"
        : section === "온라인" || section === "개인"
        ? pumpModel || "-"
        : "기타";

    const key = `${section}||${label}`;

    if (!map.has(key)) {
      map.set(key, {
        section,
        label,
        values: makeEmptyValues(periods),
      });
    }

    const g = map.get(key)!;
    for (const p of periods) addCell(g.values[p.key], d.values?.[p.key]);
  }

  const grouped = Array.from(map.values());

  const sectionOrder: PartnerAllSection[] = ["보건소", "조리원", "온라인", "개인", "기타"];
  grouped.sort((a, b) => {
    const ai = sectionOrder.indexOf(a.section);
    const bi = sectionOrder.indexOf(b.section);
    if (ai !== bi) return ai - bi;
    return a.label.localeCompare(b.label, "ko");
  });

  return grouped;
}