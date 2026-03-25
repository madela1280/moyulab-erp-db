// app/aggregate/result/AggregateResultTable.tsx

"use client";

import { Fragment } from "react";
import type {
  AggregatePeriodMeta,
  AggregateResultRow,
  AggregateCompareResult,
} from "@/aggregate/run/types.aggregateResult";
import { buildSubtotalCompareMap } from "@/aggregate/result/buildSubtotalCompareMap";

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

type CompareMetric = { current: number; compare: number; delta: number; max: number };
type ComparePeriod = {
  key: string;
  출고수량: CompareMetric;
  대여일수: CompareMetric;
  금액: CompareMetric;
};

function toSafeNumber(v: number | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function signed(n: number) {
  const v = toSafeNumber(n);
  if (v > 0) return `+${v.toLocaleString("ko-KR")}`;
  return v.toLocaleString("ko-KR");
}

function deltaColor(delta: number) {
  if (delta > 0) return "text-blue-600";
  if (delta < 0) return "text-red-600";
  return "text-gray-500";
}

function barHeightPercent(value: number, max: number) {
  const v = toSafeNumber(value);
  const m = toSafeNumber(max);
  if (v <= 0 || m <= 0) return 0;
  return Math.max(6, Math.min(100, (v / m) * 100));
}

function BigBarCell({ metric }: { metric: CompareMetric }) {
  const current = toSafeNumber(metric.current);
  const compare = toSafeNumber(metric.compare);
  const delta = toSafeNumber(metric.delta);
  const max = toSafeNumber(metric.max);

  const hCurrent = barHeightPercent(current, max);
  const hCompare = barHeightPercent(compare, max);

  return (
    <div className="relative mx-auto h-[214px] w-full min-w-[58px]">
      <div
        className={`absolute left-1/2 top-1 -translate-x-1/2 truncate text-center font-semibold leading-none ${deltaColor(
          delta
        )} text-[11px]`}
        style={{ maxWidth: "70%" }}
        title={signed(delta)}
      >
        {signed(delta)}
      </div>

      <div className="absolute inset-x-2 bottom-2 top-8 flex items-end justify-center gap-1.5">
        <div className="flex h-full w-[36%] items-end">
          <div
            className="w-full rounded-t bg-blue-500"
            style={{ height: `${hCurrent}%`, minHeight: current > 0 ? 4 : 0 }}
            title={`기준 ${formatNumber(current)}`}
          />
        </div>
        <div className="flex h-full w-[36%] items-end">
          <div
            className="w-full rounded-t bg-gray-400"
            style={{ height: `${hCompare}%`, minHeight: compare > 0 ? 4 : 0 }}
            title={`비교 ${formatNumber(compare)}`}
          />
        </div>
      </div>
    </div>
  );
}

function GraphHeader({
  periods,
}: {
  periods: AggregatePeriodMeta[];
}) {
  return (
    <thead className="sticky top-0 z-20">
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
  );
}

function GraphRow({
  pumpModel,
  compareLabel,
  periods,
  sum,
}: {
  pumpModel: string;
  compareLabel: string;
  periods: ComparePeriod[];
  sum: {
    출고수량: CompareMetric;
    대여일수: CompareMetric;
    금액: CompareMetric;
  };
}) {
  return (
    <tr className="bg-sky-50/40 border-t-2 border-gray-400">
      <td className="border px-3 py-2 align-top" colSpan={2}>
        <div className="text-[12px] font-semibold text-gray-800">{pumpModel} 소계 비교</div>
        <div className="mt-1 text-[11px] text-gray-600">{compareLabel}</div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-600">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
            <span>기준</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-400" />
            <span>비교</span>
          </span>
        </div>
      </td>

      {periods.map((p) => (
        <Fragment key={p.key}>
          <td className="border px-1 py-0 align-middle">
            <BigBarCell metric={p.출고수량} />
          </td>
          <td className="border px-1 py-0 align-middle">
            <BigBarCell metric={p.대여일수} />
          </td>
          <td className="border px-1 py-0 align-middle">
            <BigBarCell metric={p.금액} />
          </td>
        </Fragment>
      ))}

      <td className="border px-1 py-0 align-middle bg-sky-100/40">
        <BigBarCell metric={sum.출고수량} />
      </td>
      <td className="border px-1 py-0 align-middle bg-sky-100/40">
        <BigBarCell metric={sum.대여일수} />
      </td>
      <td className="border px-1 py-0 align-middle bg-sky-100/40">
        <BigBarCell metric={sum.금액} />
      </td>
    </tr>
  );
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
        </table>
      </div>
    </div>
  );
}

function CompareGraphSection({
  metaPeriods,
  mainRows,
  compareResults,
}: {
  metaPeriods: AggregatePeriodMeta[];
  mainRows: AggregateResultRow[];
  compareResults: AggregateCompareResult[];
}) {
  if (!compareResults?.length) return null;

  return (
    <div className="space-y-0">
      {compareResults.map((cmp, cmpIdx) => {
        const compareMap = buildSubtotalCompareMap({
          mainPeriods: metaPeriods,
          rows: mainRows,
          compareResults: [cmp],
        });

        const pumpOrder = Array.from(compareMap.keys());

        return (
          <div key={`${cmp.label}-${cmpIdx}`} className="overflow-auto border rounded bg-white max-h-[70vh]">
            <table className="w-max min-w-full border-collapse table-auto text-xs">
              <GraphHeader periods={metaPeriods} />
              <tbody>
                {pumpOrder.map((pumpModel) => {
                  const sets = compareMap.get(pumpModel) || [];
                  return sets.map((set, setIdx) => (
                    <GraphRow
                      key={`${cmp.label}-${pumpModel}-${setIdx}`}
                      pumpModel={pumpModel}
                      compareLabel={set.compareLabel}
                      periods={set.periods}
                      sum={set.sum}
                    />
                  ));
                })}
              </tbody>
            </table>
          </div>
        );
      })}
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

      <CompareGraphSection
        metaPeriods={meta.periods}
        mainRows={rows}
        compareResults={compareResults}
      />
    </div>
  );
}