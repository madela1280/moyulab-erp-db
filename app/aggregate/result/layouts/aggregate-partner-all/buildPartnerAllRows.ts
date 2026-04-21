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
  if (!s) return "기타";

  // 보건소 alias
  if (s === "보건소" || s.endsWith("구") || s.endsWith("시") || s.endsWith("군")) return "보건소";

  // 조리원 계열
  if (s.startsWith("조리원")) return "조리원";

  // 온라인/개인
  if (s.includes("온라인")) return "온라인";
  if (s.includes("개인")) return "개인";

  return "기타";
}

const PUMP_ORDER = ["심포니", "락티나", "스윙", "스윙맥시", "프리스타일", "시밀레", "각시밀"] as const;

function normalizePump(v: string) {
  const s = String(v ?? "").trim();
  if (s.includes("심포니")) return "심포니";
  if (s.includes("락티나")) return "락티나";
  if (s.includes("스윙맥") || s.includes("스윙맥시") || s.includes("스윙맥스")) return "스윙맥시";
  if (s.includes("프리스타일")) return "프리스타일";
  if (s.includes("스윙")) return "스윙";
  if (s.includes("시밀래") || s.includes("시밀레")) return "시밀레";
  if (s.includes("각시밀")) return "각시밀";
  return s || "미지정";
}

function pumpOrderIndex(name: string) {
  const n = normalizePump(name);
  const i = PUMP_ORDER.indexOf(n as (typeof PUMP_ORDER)[number]);
  return i >= 0 ? i : 999;
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
    let list = (byBucket.get(bucket) || []).slice();
    if (!list.length) continue;

    // 공통: 값 0인 행 숨김 (출고/대여일수/금액 합이 0이면 제외)
    list = list.filter((r) => {
      const s = (r.sum as PartnerAllCell) || emptyCell();
      return n(s.출고) !== 0 || n(s.대여일수) !== 0 || n(s.금액) !== 0;
    });
    if (!list.length) continue;

    // 보건소/조리원: 거래처별(버킷명 자체 라벨 제거 + 가나다)
    if (bucket === "보건소" || bucket === "조리원") {
      list = list.filter((r) => String(r.pumpModel ?? "").trim() !== bucket);
      if (!list.length) continue;
      list.sort((a, b) => String(a.pumpModel ?? "").localeCompare(String(b.pumpModel ?? ""), "ko"));
    }

    // 온라인/개인: 유축기별(고정 순서)
    if (bucket === "온라인" || bucket === "개인") {
      list.sort((a, b) => {
        const ai = pumpOrderIndex(String(a.pumpModel ?? ""));
        const bi = pumpOrderIndex(String(b.pumpModel ?? ""));
        if (ai !== bi) return ai - bi;
        return String(a.pumpModel ?? "").localeCompare(String(b.pumpModel ?? ""), "ko");
      });
    }

    // 기타: 1줄 통합
    if (bucket === "기타") {
      const mergedValues = makeEmptyValues(periods);
      for (const r of list) {
        for (const p of periods) addCell(mergedValues[p.key], r.values?.[p.key] as PartnerAllCell);
      }

      const mergedSum = calcSum(mergedValues, periods);
      if (n(mergedSum.출고) !== 0 || n(mergedSum.대여일수) !== 0 || n(mergedSum.금액) !== 0) {
        out.push({
          rowType: "data",
          section: "기타",
          label: "기타",
          values: mergedValues,
          sum: mergedSum,
          showSection: true,
        });

        out.push({
          rowType: "subtotal",
          section: "기타",
          label: "기타 소계",
          values: mergedValues,
          sum: mergedSum,
          showSection: true,
        });
      }
      continue;
    }

    list.forEach((r, idx) => {
      const label =
        bucket === "온라인" || bucket === "개인"
          ? normalizePump(String(r.pumpModel ?? ""))
          : String(r.pumpModel ?? "");

      out.push({
        rowType: "data",
        section: bucket,
        label,
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
    const rawPartner = String(d.partnerCategory ?? "").trim();
    const bucket = toBucket(rawPartner);
    const rawPump = String(d.pumpModel ?? "").trim();

    const label =
      bucket === "보건소" || bucket === "조리원"
        ? rawPartner || "-"
        : bucket === "온라인" || bucket === "개인"
        ? normalizePump(rawPump)
        : "기타";

    const gKey = `${bucket}||${label}`;
    if (!grouped.has(gKey)) grouped.set(gKey, makeEmptyValues(periods));

    const values = grouped.get(gKey)!;
    for (const p of periods) addCell(values[p.key], d.values?.[p.key] as PartnerAllCell);
  }

  for (const bucket of bucketOrder) {
    let rowsInBucket = Array.from(grouped.entries())
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

    if (bucket === "보건소" || bucket === "조리원") {
      // 보건소/조리원은 "거래처별"만 표시: 버킷명 자체 라벨(보건소/조리원) 행 제거
      rowsInBucket = rowsInBucket.filter((r) => r.label !== bucket);
    }

    if (!rowsInBucket.length) continue;

    if (bucket === "온라인" || bucket === "개인") {
      // 온라인/개인은 유축기 고정 순서
      rowsInBucket.sort((a, b) => {
        const ai = pumpOrderIndex(a.label);
        const bi = pumpOrderIndex(b.label);
        if (ai !== bi) return ai - bi;
        return a.label.localeCompare(b.label, "ko");
      });
    } else {
      // 보건소/조리원은 거래처명 가나다
      rowsInBucket.sort((a, b) => a.label.localeCompare(b.label, "ko"));
    }

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

  // rows가 있으면 rows 기준(기존 완성 집계 호환 유지)
  if (rows.length > 0) {
    return buildFromResultRows(periods, rows);
  }

  // rows가 비어있을 때만 deviceRows fallback
  if (deviceRows.length > 0) {
    return buildFromDeviceRows(periods, deviceRows);
  }

  return [];
}