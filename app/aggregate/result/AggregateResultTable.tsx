// app/aggregate/result/AggregateResultTable.tsx

"use client";

import { Fragment } from "react";
import type {
  AggregatePeriodMeta,
  AggregateResultRow,
  AggregateCompareResult,
} from "@/aggregate/run/types.aggregateResult";
import AggregateResultTableByDevice from "@/aggregate/result/AggregateResultTableByDevice";
import { buildDeviceGroupRows } from "@/aggregate/result/buildDeviceGroupRows";

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

function MainResultTable({
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
    <div className="mb-4">
      {title ? <div className="mb-2 text-sm font-semibold">{title}</div> : null}

      <div className="overflow-auto border rounded bg-white">
        <table className="w-max min-w-full border-collapse table-auto text-xs">
          <thead>
            <tr>
              <th className="border px-3 py-1 bg-gray-100 whitespace-nowrap min-w-[80px]" rowSpan={2}>
                기종
              </th>
              <th className="border px-3 py-1 bg-gray-100 whitespace-nowrap min-w-[96px]" rowSpan={2}>
                거래처
              </th>
              {periods.map((p) => (
                <th key={p.key} className="border px-2 py-1 bg-gray-100 whitespace-nowrap" colSpan={3}>
                  {p.label}
                </th>
              ))}
              <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap" colSpan={3}>
                합계
              </th>
            </tr>
            <tr>
              {periods.flatMap((p) => [
                <th key={`${p.key}-out`} className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">
                  출고수량
                </th>,
                <th key={`${p.key}-days`} className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">
                  대여일수
                </th>,
                <th key={`${p.key}-amount`} className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">
                  금액
                </th>,
              ])}
              <th className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">출고수량</th>
              <th className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">대여일수</th>
              <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">금액</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, idx) => {
              const rowSpan = rowSpans[idx] || 0;
              const isSubtotal = r.partnerCategory === "소계";
              return (
                <tr key={`${r.pumpModel}-${r.partnerCategory}-${idx}`} className={isSubtotal ? "bg-gray-100" : ""}>
                  {rowSpan > 0 ? (
                    <td className="border px-3 py-1 align-top text-center whitespace-nowrap min-w-[80px]" rowSpan={rowSpan}>
                      {r.pumpModel}
                    </td>
                  ) : null}
                  <td className="border px-3 py-1 whitespace-nowrap min-w-[96px]">{r.partnerCategory}</td>

                  {periods.map((p) => {
                    const v = r.values[p.key] || { 출고: 0, 대여일수: 0, 금액: 0 };
                    return (
                      <Fragment key={`${p.key}-${idx}`}>
                        <td className="border px-1 py-1 text-right min-w-[36px]">{formatNumber(v.출고)}</td>
                        <td className="border px-1 py-1 text-right min-w-[36px]">{formatRentalDays(v.대여일수)}</td>
                        <td className="border px-2 py-1 text-right">{formatNumber(v.금액)}</td>
                      </Fragment>
                    );
                  })}

                  <td className="border px-1 py-1 text-right min-w-[36px]">{formatNumber(r.sum.출고)}</td>
                  <td className="border px-1 py-1 text-right min-w-[36px]">{formatRentalDays(r.sum.대여일수)}</td>
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
                  <Fragment key={`total-${p.key}`}>
                    <td className="border px-1 py-1 text-right bg-gray-50 font-semibold min-w-[36px]">
                      {formatNumber(v.출고)}
                    </td>
                    <td className="border px-1 py-1 text-right bg-gray-50 font-semibold min-w-[36px]">
                      {formatRentalDays(v.대여일수)}
                    </td>
                    <td className="border px-2 py-1 text-right bg-gray-50 font-semibold">
                      {formatNumber(v.금액)}
                    </td>
                  </Fragment>
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

function CompareResultTable({
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
    <div className="mb-4">
      {title ? <div className="mb-2 text-sm font-semibold">{title}</div> : null}

      <div className="overflow-auto border rounded bg-white">
        <table className="w-max min-w-full border-collapse table-auto text-xs">
          <thead>
            <tr>
              <th className="border px-3 py-1 bg-gray-100 whitespace-nowrap min-w-[80px]" rowSpan={2}>
                기종
              </th>
              <th className="border px-3 py-1 bg-gray-100 whitespace-nowrap min-w-[96px]" rowSpan={2}>
                거래처
              </th>
              {periods.map((p) => (
                <th key={p.key} className="border px-2 py-1 bg-gray-100 whitespace-nowrap" colSpan={3}>
                  {p.label}
                </th>
              ))}
              <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap" colSpan={3}>
                합계
              </th>
            </tr>
            <tr>
              {periods.flatMap((p) => [
                <th key={`${p.key}-out`} className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">
                  출고수량
                </th>,
                <th key={`${p.key}-days`} className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">
                  대여일수
                </th>,
                <th key={`${p.key}-amount`} className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">
                  금액
                </th>,
              ])}
              <th className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">출고수량</th>
              <th className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">대여일수</th>
              <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">금액</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r, idx) => {
              const rowSpan = rowSpans[idx] || 0;
              const isSubtotal = r.partnerCategory === "소계";
              return (
                <tr key={`${r.pumpModel}-${r.partnerCategory}-${idx}`} className={isSubtotal ? "bg-gray-100" : ""}>
                  {rowSpan > 0 ? (
                    <td className="border px-3 py-1 align-top text-center whitespace-nowrap min-w-[80px]" rowSpan={rowSpan}>
                      {r.pumpModel}
                    </td>
                  ) : null}
                  <td className="border px-3 py-1 whitespace-nowrap min-w-[96px]">{r.partnerCategory}</td>

                  {periods.map((p) => {
                    const v = r.values[p.key] || { 출고: 0, 대여일수: 0, 금액: 0 };
                    return (
                      <Fragment key={`${p.key}-${idx}`}>
                        <td className="border px-1 py-1 text-right min-w-[36px]">{formatNumber(v.출고)}</td>
                        <td className="border px-1 py-1 text-right min-w-[36px]">{formatRentalDays(v.대여일수)}</td>
                        <td className="border px-2 py-1 text-right">{formatNumber(v.금액)}</td>
                      </Fragment>
                    );
                  })}

                  <td className="border px-1 py-1 text-right min-w-[36px]">{formatNumber(r.sum.출고)}</td>
                  <td className="border px-1 py-1 text-right min-w-[36px]">{formatRentalDays(r.sum.대여일수)}</td>
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
                  <Fragment key={`cmp-total-${p.key}`}>
                    <td className="border px-1 py-1 text-right bg-gray-50 font-semibold min-w-[36px]">
                      {formatNumber(v.출고)}
                    </td>
                    <td className="border px-1 py-1 text-right bg-gray-50 font-semibold min-w-[36px]">
                      {formatRentalDays(v.대여일수)}
                    </td>
                    <td className="border px-2 py-1 text-right bg-gray-50 font-semibold">
                      {formatNumber(v.금액)}
                    </td>
                  </Fragment>
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
  deviceRows = [],
}: {
  meta: {
    periodStart: string;
    periodEnd: string;
    periods: AggregatePeriodMeta[];
    pumpScope?: "전체" | "기종";
    selectedPumpModel?: string;
  };
  rows: AggregateResultRow[];
  compareResults: AggregateCompareResult[];
  deviceRows?: Array<{
    pumpModel: string;
    partnerCategory: string;
    deviceNo: string;
    rentKind?: "구매" | "렌탈" | "";
    values: Record<string, { 출고: number; 대여일수: number; 금액: number }>;
    sum: { 출고: number; 대여일수: number; 금액: number };
  }>;
}) {
  if (meta?.pumpScope === "기종" && meta?.selectedPumpModel) {
    const blocks = buildDeviceGroupRows({
      periods: meta.periods,
      items: deviceRows,
      pumpOrder: [meta.selectedPumpModel],
    });

    return (
      <AggregateResultTableByDevice
        title={`유축기 기종 : ${meta.selectedPumpModel} (${meta.periodStart} ~ ${meta.periodEnd})`}
        periods={meta.periods}
        blocks={blocks}
      />
    );
  }

  return (
    <div className="space-y-4">
      <MainResultTable
        title={`유축기 전체 : ${meta.periodStart} ~ ${meta.periodEnd}`}
        periods={meta.periods}
        rows={rows}
      />

      {compareResults?.map((cmp, i) => (
        <CompareResultTable
          key={`${cmp.label}-${i}`}
          title={`비교: ${cmp.label} (${cmp.periodStart} ~ ${cmp.periodEnd})`}
          periods={cmp.periods}
          rows={cmp.rows}
        />
      ))}
    </div>
  );
}