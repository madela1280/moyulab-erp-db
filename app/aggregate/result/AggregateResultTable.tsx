"use client";

import type {
  AggregatePeriodMeta,
  AggregateResultRow,
  AggregateCompareResult,
} from "@/aggregate/run/types.aggregateResult";

function formatNumber(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("ko-KR");
}

function buildGroupRowSpans(rows: AggregateResultRow[]) {
  const spans: Record<number, number> = {};
  let i = 0;
  while (i < rows.length) {
    const pump = rows[i].pumpModel;
    let j = i;
    while (j < rows.length && rows[j].pumpModel === pump) j++;
    spans[i] = j - i;
    i = j;
  }
  return spans;
}

function ResultTableBlock({
  title,
  periods,
  rows,
}: {
  title?: string;
  periods: AggregatePeriodMeta[];
  rows: AggregateResultRow[];
}) {
  const rowSpans = buildGroupRowSpans(rows);

  return (
    <div className="mb-6">
      {title ? <div className="mb-2 text-sm font-semibold">{title}</div> : null}

      <div className="overflow-auto border rounded bg-white">
        <table className="min-w-[900px] w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border px-2 py-1 bg-gray-50" rowSpan={2}>
                기종
              </th>
              <th className="border px-2 py-1 bg-gray-50" rowSpan={2}>
                거래처
              </th>
              {periods.map((p) => (
                <th key={p.key} className="border px-2 py-1 bg-gray-50" colSpan={3}>
                  {p.label}
                </th>
              ))}
              <th className="border px-2 py-1 bg-gray-50" colSpan={3}>
                합계
              </th>
            </tr>
            <tr>
              {periods.map((p) => (
                <th key={`${p.key}-sub`} className="border px-2 py-1 bg-gray-50" colSpan={3}>
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-center">출고</span>
                    <span className="text-center">가중</span>
                    <span className="text-center">금액</span>
                  </div>
                </th>
              ))}
              <th className="border px-2 py-1 bg-gray-50" colSpan={3}>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-center">출고</span>
                  <span className="text-center">가중</span>
                  <span className="text-center">금액</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const rowSpan = rowSpans[idx] || 0;
              return (
                <tr key={`${r.pumpModel}-${r.partnerCategory}-${idx}`}>
                  {rowSpan > 0 ? (
                    <td className="border px-2 py-1 align-top text-center" rowSpan={rowSpan}>
                      {r.pumpModel}
                    </td>
                  ) : null}
                  <td className="border px-2 py-1">{r.partnerCategory}</td>

                  {periods.map((p) => {
                    const v = r.values[p.key] || { 출고: 0, 가중: 0, 금액: 0 };
                    return (
                      <td key={`${p.key}-${idx}`} className="border px-2 py-1" colSpan={3}>
                        <div className="grid grid-cols-3 gap-2">
                          <span className="text-right">{formatNumber(v.출고)}</span>
                          <span className="text-right">{formatNumber(v.가중)}</span>
                          <span className="text-right">{formatNumber(v.금액)}</span>
                        </div>
                      </td>
                    );
                  })}

                  <td className="border px-2 py-1" colSpan={3}>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-right">{formatNumber(r.sum.출고)}</span>
                      <span className="text-right">{formatNumber(r.sum.가중)}</span>
                      <span className="text-right">{formatNumber(r.sum.금액)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AggregateResultTable({
  meta,
  rows,
  compareResults,
}: {
  meta: { periods: AggregatePeriodMeta[] };
  rows: AggregateResultRow[];
  compareResults: AggregateCompareResult[];
}) {
  return (
    <div className="space-y-6">
      <ResultTableBlock title="본집계" periods={meta.periods} rows={rows} />

      {compareResults?.map((cmp, i) => (
        <ResultTableBlock
          key={`${cmp.label}-${i}`}
          title={`비교: ${cmp.label} (${cmp.periodStart} ~ ${cmp.periodEnd})`}
          periods={cmp.periods}
          rows={cmp.rows}
        />
      ))}
    </div>
  );
}