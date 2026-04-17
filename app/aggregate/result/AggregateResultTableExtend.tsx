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

  const total = { 수량: 0, 대여일수: 0, 금액: 0, 비중치: 0, zeroAmount: 0 };

  for (const r of rows) {
    if (r.partnerCategory === "소계") continue;

    let onePlusCount = 0;
    let onePlusDays = 0;
    let onePlusAmount = 0;
    let zeroAmount = 0;

    for (const p of periods) {
      const v = r.values[p.key] || { 출고수량: 0, 수량: 0, 대여일수: 0, 금액: 0 };
      const count = p.key === "0차연장" ? v.출고수량 : v.수량;

      byPeriod[p.key].출고수량 += count;
      byPeriod[p.key].대여일수 += v.대여일수;
      byPeriod[p.key].금액 += v.금액;

      if (p.key === "0차연장") {
        zeroAmount += Number(v.금액 || 0);
      } else {
        onePlusCount += Number(count || 0);
        onePlusDays += Number(v.대여일수 || 0);
        onePlusAmount += Number(v.금액 || 0);
      }
    }

    total.수량 += onePlusCount;
    total.대여일수 += onePlusDays;
    total.금액 += onePlusAmount;
    total.zeroAmount += zeroAmount;
  }

 const denom = total.zeroAmount + total.금액;
if (total.금액 > 0 && total.zeroAmount <= 0) {
  total.비중치 = 100;
} else {
  total.비중치 = denom > 0 ? (total.금액 / denom) * 100 : 0;
}

  return { byPeriod, total };
}

export function AggregateResultTableExtend({
  meta,
  rows,
  compareResults,
}: {
  meta: {
    periodStart: string;
    periodEnd: string;
    periods: AggregateExtendPeriodMeta[];
  };
  rows: AggregateExtendResultRow[];
  compareResults?: Array<{
    label: "전년동일기간" | "전월동일기간";
    meta: {
      periodStart: string;
      periodEnd: string;
      periods: AggregateExtendPeriodMeta[];
    };
    rows: AggregateExtendResultRow[];
  }>;
}) {
  const rowSpans = buildPumpRowSpans(rows);
  const totals = buildTotals(rows, meta.periods);
    const compareBlocks = (compareResults || []).map((c) => ({
    label: c.label,
    totals: buildTotals(c.rows || [], c.meta?.periods || meta.periods),
  }));

function renderTableBlock(params: {
  blockMeta: { periodStart: string; periodEnd: string; periods: AggregateExtendPeriodMeta[] };
  blockRows: AggregateExtendResultRow[];
  title?: string;
  keyPrefix: string;
  blockClassName?: string;
}) {
  const { blockMeta, blockRows, title, keyPrefix, blockClassName } = params;
  const blockRowSpans = buildPumpRowSpans(blockRows || []);
  const blockTotals = buildTotals(blockRows || [], blockMeta.periods || []);

  return (
    <div className={`border rounded bg-white relative overflow-hidden ${blockClassName ?? "h-[430px] mt-4"}`}>
      {title ? <div className="px-3 py-2 border-b bg-gray-50 text-sm font-semibold">{title}</div> : null}

      <div className="h-full overflow-auto">
        <table className="w-max min-w-full border-collapse table-auto text-xs">
            <thead className="sticky top-0 z-40 bg-gray-100">
              <tr>
                <th
                  className="border px-3 py-1 bg-gray-100 whitespace-nowrap min-w-[80px] sticky left-0 z-50"
                  rowSpan={2}
                >
                  기종
                </th>
                <th
                  className="border px-3 py-1 bg-gray-100 whitespace-nowrap min-w-[96px] sticky left-[80px] z-50 shadow-[inset_-1px_0_0_0_#d1d5db]"
                  rowSpan={2}
                >
                  거래처
                </th>

                {(blockMeta.periods || []).map((p) => (
                  <th key={`${keyPrefix}-${p.key}`} className="border px-2 py-1 bg-gray-100 whitespace-nowrap" colSpan={3}>
                    {p.label}
                  </th>
                ))}

                <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap" colSpan={4}>
                  합계(1차연장 ~ )
                </th>
              </tr>
              <tr>
                {(blockMeta.periods || []).flatMap((p) => [
                  <th key={`${keyPrefix}-${p.key}-out`} className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">
                    {p.key === "0차연장" ? "출고수량" : "수량"}
                  </th>,
                  <th key={`${keyPrefix}-${p.key}-days`} className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">
                    대여일수
                  </th>,
                  <th key={`${keyPrefix}-${p.key}-amt`} className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">
                    금액
                  </th>,
                ])}

                <th className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">수량</th>
                <th className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">대여일수</th>
                <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">금액</th>
                <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">비중치</th>
              </tr>
            </thead>

            <tbody>
              {(blockRows || []).map((r, idx) => {
                const rowSpan = blockRowSpans[idx] || 0;
                const isSubtotal = r.partnerCategory === "소계";

                return (
                  <tr key={`${keyPrefix}-${r.pumpModel}-${r.partnerCategory}-${idx}`} className={isSubtotal ? "bg-gray-100" : ""}>
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
                      className={`border px-3 py-1 whitespace-nowrap min-w-[96px] sticky left-[80px] z-30 shadow-[inset_-1px_0_0_0_#d1d5db] ${
                        isSubtotal ? "bg-gray-100" : "bg-white"
                      }`}
                    >
                      {r.partnerCategory}
                    </td>

                    {(blockMeta.periods || []).map((p) => {
                      const v = (r.values as any)?.[p.key] || { 출고수량: 0, 수량: 0, 대여일수: 0, 금액: 0 };
                      const count = p.key === "0차연장" ? v.출고수량 : v.수량;
                      return (
                        <Fragment key={`${keyPrefix}-${p.key}-${idx}`}>
                          <td className="border px-1 py-1 text-right">{formatNumber(count)}</td>
                          <td className="border px-1 py-1 text-right">{formatNumber(v.대여일수)}</td>
                          <td className="border px-2 py-1 text-right">{formatNumber(v.금액)}</td>
                        </Fragment>
                      );
                    })}

                    {(() => {
                      let rowCount = 0;
                      let rowDays = 0;
                      let rowAmount = 0;
                      let rowZeroAmount = 0;

                      for (const p of blockMeta.periods || []) {
                        const v = (r.values as any)?.[p.key] || { 출고수량: 0, 수량: 0, 대여일수: 0, 금액: 0 };
                        const count = p.key === "0차연장" ? v.출고수량 : v.수량;

                        if (p.key === "0차연장") {
                          rowZeroAmount += Number(v.금액 || 0);
                        } else {
                          rowCount += Number(count || 0);
                          rowDays += Number(v.대여일수 || 0);
                          rowAmount += Number(v.금액 || 0);
                        }
                      }

                      const denom = rowZeroAmount + rowAmount;
                      const rowWeight =
                        rowAmount > 0 && rowZeroAmount <= 0
                          ? 100
                          : denom > 0
                          ? (rowAmount / denom) * 100
                          : 0;

                      return (
                        <>
                          <td className="border px-1 py-1 text-right">{formatNumber(rowCount)}</td>
                          <td className="border px-1 py-1 text-right">{formatNumber(rowDays)}</td>
                          <td className="border px-2 py-1 text-right">{formatNumber(rowAmount)}</td>
                          <td className="border px-2 py-1 text-right">{`${rowWeight.toFixed(1)}%`}</td>
                        </>
                      );
                    })()}
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr>
                <td
                  className="border px-2 py-1 bg-gray-50 font-semibold text-center sticky left-0 z-40 shadow-[inset_-1px_0_0_0_#d1d5db]"
                  colSpan={2}
                >
                  합계
                </td>

                {(blockMeta.periods || []).map((p) => {
                  const v = blockTotals.byPeriod[p.key] || { 출고수량: 0, 대여일수: 0, 금액: 0 };
                  return (
                    <Fragment key={`${keyPrefix}-total-${p.key}`}>
                      <td className="border px-1 py-1 text-right bg-gray-50 font-semibold">{formatNumber(v.출고수량)}</td>
                      <td className="border px-1 py-1 text-right bg-gray-50 font-semibold">{formatNumber(v.대여일수)}</td>
                      <td className="border px-2 py-1 text-right bg-gray-50 font-semibold">{formatNumber(v.금액)}</td>
                    </Fragment>
                  );
                })}

                <td className="border px-1 py-1 text-right bg-gray-50 font-semibold">{formatNumber(blockTotals.total.수량)}</td>
                <td className="border px-1 py-1 text-right bg-gray-50 font-semibold">{formatNumber(blockTotals.total.대여일수)}</td>
                <td className="border px-2 py-1 text-right bg-gray-50 font-semibold">{formatNumber(blockTotals.total.금액)}</td>
                <td className="border px-2 py-1 text-right bg-gray-50 font-semibold">
                  {`${Number(blockTotals.total.비중치 || 0).toFixed(1)}%`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

const hasCompare = (compareResults || []).length > 0;

return (
  <div className="w-full h-full overflow-y-auto flex flex-col gap-3">
    <div className="text-sm font-semibold shrink-0">
      연장 집계 : {meta.periodStart} ~ {meta.periodEnd}
    </div>

    {renderTableBlock({
      blockMeta: meta,
      blockRows: rows,
      keyPrefix: "main",
      blockClassName: hasCompare ? "h-[430px] mt-4" : "h-[calc(100vh-220px)] mt-2",
    })}

    {(compareResults || []).map((cmp, idx) =>
      renderTableBlock({
        blockMeta: cmp.meta,
        blockRows: cmp.rows || [],
        title: `${cmp.label} (${cmp.meta.periodStart} ~ ${cmp.meta.periodEnd})`,
        keyPrefix: `cmp-${idx}-${cmp.label}`,
        blockClassName: "h-[430px] mt-2",
      })
    )}
  </div>
); 
}