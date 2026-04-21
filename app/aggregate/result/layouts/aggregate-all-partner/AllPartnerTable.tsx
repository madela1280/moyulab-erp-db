// app/aggregate/result/layouts/aggregate-all-partner/AllPartnerTable.tsx
"use client";

import { Fragment } from "react";
import type {
  AggregatePeriodMeta,
  AggregateResultRow,
} from "@/aggregate/run/types.aggregateResult";

type RowKind =
  | "section"
  | "data"
  | "subtotal"
  | "etc"
  | "grandTotal";

type ViewRow = {
  kind: RowKind;
  group: "보건소" | "조리원" | "온라인" | "개인" | "기타" | "합계";
  label: string;
  values: Record<string, { 출고: number; 대여일수: number; 금액: number }>;
  sum: { 출고: number; 대여일수: number; 금액: number };
};

function n(v: number | null | undefined) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function fmt(v: number | null | undefined) {
  return n(v).toLocaleString("ko-KR");
}
function fmtDays(v: number | null | undefined) {
  return Math.round(n(v)).toLocaleString("ko-KR");
}
function emptyCell() {
  return { 출고: 0, 대여일수: 0, 금액: 0 };
}
function makeEmptyValues(periods: AggregatePeriodMeta[]) {
  const o: Record<string, { 출고: number; 대여일수: number; 금액: number }> = {};
  for (const p of periods) o[p.key] = emptyCell();
  return o;
}
function addCell(
  a: { 출고: number; 대여일수: number; 금액: number },
  b: { 출고: number; 대여일수: number; 금액: number } | undefined
) {
  a.출고 += n(b?.출고);
  a.대여일수 += n(b?.대여일수);
  a.금액 += n(b?.금액);
}
function calcSum(
  values: Record<string, { 출고: number; 대여일수: number; 금액: number }>,
  periods: AggregatePeriodMeta[]
) {
  const s = emptyCell();
  for (const p of periods) addCell(s, values[p.key]);
  return s;
}

const PUMP_ORDER = ["심포니", "락티나", "스윙", "스윙맥시", "프리스타일", "시밀래", "각시밀"] as const;

function pumpIdx(name: string) {
  const i = PUMP_ORDER.indexOf(String(name ?? "").trim() as any);
  return i >= 0 ? i : 999;
}

function buildRows(periods: AggregatePeriodMeta[], rows: AggregateResultRow[]): ViewRow[] {
  const byBucket = new Map<string, AggregateResultRow[]>();
  for (const r of rows || []) {
    if (r.partnerCategory === "소계") continue;
    const b = String(r.partnerCategory || "기타").trim() || "기타";
    if (!byBucket.has(b)) byBucket.set(b, []);
    byBucket.get(b)!.push(r);
  }

  const out: ViewRow[] = [];

  // 보건소/조리원: 거래처별(구분행 반복 제거)
  (["보건소", "조리원"] as const).forEach((g) => {
    const list = (byBucket.get(g) || []).slice().sort((a, b) => a.pumpModel.localeCompare(b.pumpModel, "ko"));
    if (!list.length) return;

    for (const r of list) {
      out.push({
        kind: "data",
        group: g,
        label: r.pumpModel,
        values: r.values || makeEmptyValues(periods),
        sum: r.sum || emptyCell(),
      });
    }

    const sv = makeEmptyValues(periods);
    for (const r of list) for (const p of periods) addCell(sv[p.key], r.values?.[p.key]);
    out.push({
      kind: "subtotal",
      group: g,
      label: `${g} 소계`,
      values: sv,
      sum: calcSum(sv, periods),
    });
  });

  // 온라인/개인: 유축기별(구분행 반복 제거)
  (["온라인", "개인"] as const).forEach((g) => {
    const list = (byBucket.get(g) || [])
      .slice()
      .sort((a, b) => {
        const ai = pumpIdx(a.pumpModel);
        const bi = pumpIdx(b.pumpModel);
        if (ai !== bi) return ai - bi;
        return a.pumpModel.localeCompare(b.pumpModel, "ko");
      });
    if (!list.length) return;

    for (const r of list) {
      out.push({
        kind: "data",
        group: g,
        label: r.pumpModel,
        values: r.values || makeEmptyValues(periods),
        sum: r.sum || emptyCell(),
      });
    }

    const sv = makeEmptyValues(periods);
    for (const r of list) for (const p of periods) addCell(sv[p.key], r.values?.[p.key]);
    out.push({
      kind: "subtotal",
      group: g,
      label: `${g} 소계`,
      values: sv,
      sum: calcSum(sv, periods),
    });
  });

  // 기타: 구분없이 1행
  {
    const list = byBucket.get("기타") || [];
    const vv = makeEmptyValues(periods);
    for (const r of list) for (const p of periods) addCell(vv[p.key], r.values?.[p.key]);
    out.push({
      kind: "etc",
      group: "기타",
      label: "기타",
      values: vv,
      sum: calcSum(vv, periods),
    });
  }

  // 합계
  {
    const vv = makeEmptyValues(periods);
    for (const r of out) {
      for (const p of periods) addCell(vv[p.key], r.values?.[p.key]);
    }
    out.push({
      kind: "grandTotal",
      group: "합계",
      label: "합계",
      values: vv,
      sum: calcSum(vv, periods),
    });
  }

  return out;
}

export default function AllPartnerTable({
  periods,
  rows,
}: {
  periods: AggregatePeriodMeta[];
  rows: AggregateResultRow[];
}) {
  const vRows = buildRows(periods, rows);

  return (
    <div className="overflow-auto border rounded bg-white">
      <table className="w-max min-w-full border-collapse table-auto text-xs">
        <thead>
          <tr>
            <th className="border px-2 py-1 bg-gray-100" rowSpan={2}>구분</th>
            <th className="border px-2 py-1 bg-gray-100" rowSpan={2}>거래처</th>
            {periods.map((p) => (
              <th key={p.key} className="border px-2 py-1 bg-gray-100" colSpan={3}>
                {p.label}
              </th>
            ))}
            <th className="border px-2 py-1 bg-gray-100" colSpan={3}>합계</th>
          </tr>
          <tr>
            {periods.flatMap((p) => [
              <th key={`${p.key}-o`} className="border px-1 py-1 bg-gray-100">출고수량</th>,
              <th key={`${p.key}-d`} className="border px-1 py-1 bg-gray-100">대여일수</th>,
              <th key={`${p.key}-a`} className="border px-1 py-1 bg-gray-100">금액</th>,
            ])}
            <th className="border px-1 py-1 bg-gray-100">출고수량</th>
            <th className="border px-1 py-1 bg-gray-100">대여일수</th>
            <th className="border px-1 py-1 bg-gray-100">금액</th>
          </tr>
        </thead>
        <tbody>
          {vRows.map((r, i) => {
            const cls =
              r.kind === "section" ? "bg-gray-50 font-semibold" :
              r.kind === "subtotal" ? "bg-gray-100 font-semibold" :
              r.kind === "grandTotal" ? "bg-amber-50 font-semibold border-t-2 border-gray-500" :
              "";
            return (
              <tr key={`${r.kind}-${r.group}-${i}`} className={cls}>
                <td className="border px-2 py-1 whitespace-nowrap">{r.group}</td>
                <td className="border px-2 py-1 whitespace-nowrap">{r.label}</td>
                {periods.map((p) => {
                  const v = r.values?.[p.key] || emptyCell();
                  return (
                    <Fragment key={`${i}-${p.key}`}>
                      <td className="border px-1 py-1 text-right">{fmt(v.출고)}</td>
                      <td className="border px-1 py-1 text-right">{fmtDays(v.대여일수)}</td>
                      <td className="border px-1 py-1 text-right">{fmt(v.금액)}</td>
                    </Fragment>
                  );
                })}
                <td className="border px-1 py-1 text-right">{fmt(r.sum.출고)}</td>
                <td className="border px-1 py-1 text-right">{fmtDays(r.sum.대여일수)}</td>
                <td className="border px-1 py-1 text-right">{fmt(r.sum.금액)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}