// app/aggregate/result/AggregateResultTable.tsx

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

function formatRentalDays(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return Math.round(v).toLocaleString("ko-KR");
}

function buildColumnTotals(rows: AggregateResultRow[], periods: AggregatePeriodMeta[]) {
  const totals: Record<string, { 출고: number; 대여일수: number; 금액: number }> = {};
  for (const p of periods) totals[p.key] = { 출고: 0, 대여일수: 0, 금액: 0 };

  for (const r of rows) {
    if (r.partnerCategory === "소계") continue;
    for (const p of periods) {
      const v = r.values[p.key] || { 출고: 0, 대여일수: 0, 금액: 0 };
      totals[p.key].출고 += v.출고;
      totals[p.key].대여일수 += v.대여일수;
      totals[p.key].금액 += v.금액;
    }
  }

  const sum = { 출고: 0, 대여일수: 0, 금액: 0 };
  for (const p of periods) {
    sum.출고 += totals[p.key].출고;
    sum.대여일수 += totals[p.key].대여일수;
    sum.금액 += totals[p.key].금액;
  }

  return { totals, sum };
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
  const columnTotals = buildColumnTotals(rows, periods);

  return (
    <div className="mb-6">
      {title ? <div className="mb-2 text-sm font-semibold">{title}</div> : null}

      <div className="overflow-auto border rounded bg-white">
        <table className="min-w-[900px] w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border px-2 py-1 bg-gray-100" rowSpan={3}>
                기종
              </th>
              <th className="border px-2 py-1 bg-gray-100" rowSpan={3}>
                거래처
              </th>
              {periods.map((p) => (
                <th key={p.key} className="border px-2 py-1 bg-gray-100" colSpan={3}>
                  {p.label}
                </th>
              ))}
              <th className="border px-2 py-1 bg-gray-100" colSpan={3}>
                합계
              </th>
            </tr>
            <tr>
              {periods.map((p) => (
                <span key={`${p.key}-qty`} className="contents">
                  <th className="border px-2 py-1 bg-gray-100" colSpan={2}>
                    수량
                  </th>
                  <th className="border px-2 py-1 bg-gray-100" rowSpan={2}>
                    금액
                  </th>
                </span>
              ))}
              <th className="border px-2 py-1 bg-gray-100" colSpan={2}>
                수량
              </th>
              <th className="border px-2 py-1 bg-gray-100" rowSpan={2}>
                금액
              </th>
            </tr>
            <tr>
              {periods.map((p) => (
                <span key={`${p.key}-sub`} className="contents">
                  <th className="border px-1 py-1 bg-gray-100 min-w-[36px]">출고</th>
                  <th className="border px-1 py-1 bg-gray-100 min-w-[36px]">대여일수</th>
                </span>
              ))}
              <th className="border px-1 py-1 bg-gray-100 min-w-[36px]">출고</th>
              <th className="border px-1 py-1 bg-gray-100 min-w-[36px]">대여일수</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const rowSpan = rowSpans[idx] || 0;
              const isSubtotal = r.partnerCategory === "소계";
              return (
                <tr
                  key={`${r.pumpModel}-${r.partnerCategory}-${idx}`}
                  className={isSubtotal ? "bg-gray-100" : ""}
                >
                  {rowSpan > 0 ? (
                    <td className="border px-2 py-1 align-top text-center" rowSpan={rowSpan}>
                      {r.pumpModel}
                    </td>
                  ) : null}
                  <td className="border px-2 py-1">{r.partnerCategory}</td>

                  {periods.map((p) => {
                    const v = r.values[p.key] || { 출고: 0, 대여일수: 0, 금액: 0 };
                    return (
                      <span key={`${p.key}-${idx}`} className="contents">
                        <td className="border px-1 py-1 text-right min-w-[36px]">
                          {formatNumber(v.출고)}
                        </td>
                        <td className="border px-1 py-1 text-right min-w-[36px]">
                          {formatRentalDays(v.대여일수)}
                        </td>
                        <td className="border px-2 py-1 text-right">{formatNumber(v.금액)}</td>
                      </span>
                    );
                  })}

                  <td className="border px-1 py-1 text-right min-w-[36px]">
                    {formatNumber(r.sum.출고)}
                  </td>
                  <td className="border px-1 py-1 text-right min-w-[36px]">
                    {formatRentalDays(r.sum.대여일수)}
                  </td>
                  <td className="border px-2 py-1 text-right">{formatNumber(r.sum.금액)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="border px-2 py-1 bg-gray-50 font-semibold text-center" colSpan={2}>
                합계
              </td>
              {periods.map((p) => {
                const v = columnTotals.totals[p.key];
                return (
                  <span key={`total-${p.key}`} className="contents">
                    <td className="border px-1 py-1 text-right bg-gray-50 font-semibold min-w-[36px]">
                      {formatNumber(v.출고)}
                    </td>
                    <td className="border px-1 py-1 text-right bg-gray-50 font-semibold min-w-[36px]">
                      {formatRentalDays(v.대여일수)}
                    </td>
                    <td className="border px-2 py-1 text-right bg-gray-50 font-semibold">
                      {formatNumber(v.금액)}
                    </td>
                  </span>
                );
              })}
              <td className="border px-1 py-1 text-right bg-gray-50 font-semibold min-w-[36px]">
                {formatNumber(columnTotals.sum.출고)}
              </td>
              <td className="border px-1 py-1 text-right bg-gray-50 font-semibold min-w-[36px]">
                {formatRentalDays(columnTotals.sum.대여일수)}
              </td>
              <td className="border px-2 py-1 text-right bg-gray-50 font-semibold">
                {formatNumber(columnTotals.sum.금액)}
              </td>
            </tr>
          </tfoot>
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
  meta: { periodStart: string; periodEnd: string; periods: AggregatePeriodMeta[] };
  rows: AggregateResultRow[];
  compareResults: AggregateCompareResult[];
}) {
  return (
    <div className="space-y-6">
      <ResultTableBlock
        title={`유축기 전체 : ${meta.periodStart} ~ ${meta.periodEnd}`}
        periods={meta.periods}
        rows={rows}
      />

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