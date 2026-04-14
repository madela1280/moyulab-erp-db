"use client";

import { Fragment } from "react";
import type {
  AggregateExtendPeriodMeta,
  AggregateExtendResultRow,
} from "@/aggregate/run/types.aggregateExtendResult";

function formatNumber(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("ko-KR");
}

function buildPumpRowSpans(rows: AggregateExtendResultRow[]) {
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

function buildTotals(
  rows: AggregateExtendResultRow[],
  periods: AggregateExtendPeriodMeta[]
) {
  const byPeriod: Record<string, { 출고수량: number; 대여일수: number; 금액: number }> = {};
  for (const p of periods) byPeriod[p.key] = { 출고수량: 0, 대여일수: 0, 금액: 0 };

  const total = { 출고수량: 0, 대여일수: 0, 금액: 0, 비중치: 0 };

  for (const r of rows) {
    if (r.partnerCategory === "소계") continue;
    for (const p of periods) {
      const v = r.values[p.key] || { 출고수량: 0, 대여일수: 0, 금액: 0 };
      byPeriod[p.key].출고수량 += v.출고수량;
      byPeriod[p.key].대여일수 += v.대여일수;
      byPeriod[p.key].금액 += v.금액;
    }
    total.출고수량 += r.sum.출고수량;
    total.대여일수 += r.sum.대여일수;
    total.금액 += r.sum.금액;
    total.비중치 += r.weight;
  }

  return { byPeriod, total };
}

export function AggregateResultTableExtend({
  meta,
  rows,
}: {
  meta: {
    periodStart: string;
    periodEnd: string;
    periods: AggregateExtendPeriodMeta[];
  };
  rows: AggregateExtendResultRow[];
}) {
  const rowSpans = buildPumpRowSpans(rows);
  const totals = buildTotals(rows, meta.periods);

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">
        연장 집계 : {meta.periodStart} ~ {meta.periodEnd}
      </div>

      <div className="overflow-auto border rounded bg-white relative">
        <table className="w-max min-w-full border-collapse table-auto text-xs">
          <thead className="sticky top-0 z-40">
            <tr>
              <th
                className="border px-3 py-1 bg-gray-100 whitespace-nowrap min-w-[80px] sticky left-0 z-50"
                rowSpan={2}
              >
                기종
              </th>
              <th
                className="border px-3 py-1 bg-gray-100 whitespace-nowrap min-w-[96px] sticky left-[80px] z-50"
                rowSpan={2}
              >
                거래처
              </th>

              {meta.periods.map((p) => (
                <th key={p.key} className="border px-2 py-1 bg-gray-100 whitespace-nowrap" colSpan={3}>
                  {p.label}
                </th>
              ))}

              <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap" colSpan={4}>
                합계(1차연장 ~ )
              </th>
            </tr>
            <tr>
              {meta.periods.flatMap((p) => [
                <th key={`${p.key}-out`} className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">
                  출고수량
                </th>,
                <th key={`${p.key}-days`} className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">
                  대여일수
                </th>,
                <th key={`${p.key}-amt`} className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">
                  금액
                </th>,
              ])}

              <th className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">출고수량</th>
              <th className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">대여일수</th>
              <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">금액</th>
              <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">비중치</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, idx) => {
              const rowSpan = rowSpans[idx] || 0;
              const isSubtotal = r.partnerCategory === "소계";

              return (
                <tr key={`${r.pumpModel}-${r.partnerCategory}-${idx}`} className={isSubtotal ? "bg-gray-100" : ""}>
                  {rowSpan > 0 ? (
                    <td
                      className={`border px-3 py-1 align-top text-center whitespace-nowrap min-w-[80px] sticky left-0 z-30 ${
                        isSubtotal ? "bg-gray-100" : "bg-white"
                      }`}
                      rowSpan={rowSpan}
                    >
                      {r.pumpModel}
                    </td>
                  ) : null}

                  <td
                    className={`border px-3 py-1 whitespace-nowrap min-w-[96px] sticky left-[80px] z-30 ${
                      isSubtotal ? "bg-gray-100" : "bg-white"
                    }`}
                  >
                    {r.partnerCategory}
                  </td>

                  {meta.periods.map((p) => {
                    const v = r.values[p.key] || { 출고수량: 0, 대여일수: 0, 금액: 0 };
                    return (
                      <Fragment key={`${p.key}-${idx}`}>
                        <td className="border px-1 py-1 text-right">{formatNumber(v.출고수량)}</td>
                        <td className="border px-1 py-1 text-right">{formatNumber(v.대여일수)}</td>
                        <td className="border px-2 py-1 text-right">{formatNumber(v.금액)}</td>
                      </Fragment>
                    );
                  })}

                  <td className="border px-1 py-1 text-right">{formatNumber(r.sum.출고수량)}</td>
                  <td className="border px-1 py-1 text-right">{formatNumber(r.sum.대여일수)}</td>
                  <td className="border px-2 py-1 text-right">{formatNumber(r.sum.금액)}</td>
                  <td className="border px-2 py-1 text-right">{formatNumber(r.weight)}</td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td className="border px-2 py-1 bg-gray-50 font-semibold text-center sticky left-0 z-40" colSpan={2}>
                합계
              </td>

              {meta.periods.map((p) => {
                const v = totals.byPeriod[p.key];
                return (
                  <Fragment key={`total-${p.key}`}>
                    <td className="border px-1 py-1 text-right bg-gray-50 font-semibold">
                      {formatNumber(v.출고수량)}
                    </td>
                    <td className="border px-1 py-1 text-right bg-gray-50 font-semibold">
                      {formatNumber(v.대여일수)}
                    </td>
                    <td className="border px-2 py-1 text-right bg-gray-50 font-semibold">
                      {formatNumber(v.금액)}
                    </td>
                  </Fragment>
                );
              })}

              <td className="border px-1 py-1 text-right bg-gray-50 font-semibold">
                {formatNumber(totals.total.출고수량)}
              </td>
              <td className="border px-1 py-1 text-right bg-gray-50 font-semibold">
                {formatNumber(totals.total.대여일수)}
              </td>
              <td className="border px-2 py-1 text-right bg-gray-50 font-semibold">
                {formatNumber(totals.total.금액)}
              </td>
              <td className="border px-2 py-1 text-right bg-gray-50 font-semibold">
                {formatNumber(totals.total.비중치)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}