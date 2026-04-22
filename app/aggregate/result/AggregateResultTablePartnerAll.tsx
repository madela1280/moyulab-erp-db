"use client";

import type {
  AggregateCompareResult,
  AggregateDeviceRow,
  AggregatePeriodMeta,
  AggregateResultRow,
} from "@/aggregate/run/types.aggregateResult";
import PartnerAllTable from "@/aggregate/result/layouts/aggregate-partner-all/PartnerAllTable";

type Meta = {
  periodStart: string;
  periodEnd: string;
  periods: AggregatePeriodMeta[];
};

export default function AggregateResultTablePartnerAll({
  meta,
  rows,
  compareResults = [],
  deviceRows = [],
}: {
  meta: Meta;
  rows: AggregateResultRow[];
  compareResults?: AggregateCompareResult[];
  deviceRows?: AggregateDeviceRow[];
}) {
  return (
    <div className="space-y-4">
      <PartnerAllTable meta={meta} rows={rows} deviceRows={deviceRows} />

      {compareResults.map((cmp, idx) => {
        const compareMeta: Meta = {
          periodStart: cmp.periodStart,
          periodEnd: cmp.periodEnd,
          periods: cmp.periods,
        };

        return (
          <div key={`${cmp.label}-${cmp.periodStart}-${cmp.periodEnd}-${idx}`} className="space-y-2">
            <div className="text-sm font-semibold text-gray-700">
              비교: {cmp.label} ({cmp.periodStart} ~ {cmp.periodEnd})
            </div>
            <PartnerAllTable meta={compareMeta} rows={cmp.rows} deviceRows={[]} />
          </div>
        );
      })}
    </div>
  );
}