"use client";

import type {
  AggregatePeriodMeta,
  AggregateResultRow,
  AggregateDeviceRow,
} from "@/aggregate/run/types.aggregateResult";
import { buildPartnerAllRows } from "./buildPartnerAllRows";
import PartnerAllHeader from "./ui/PartnerAllHeader";
import PartnerAllBody from "./ui/PartnerAllBody";

type Props = {
  meta: {
    periodStart: string;
    periodEnd: string;
    periods: AggregatePeriodMeta[];
  };
  rows: AggregateResultRow[];
  deviceRows?: AggregateDeviceRow[];
};

export default function PartnerAllTable({ meta, rows, deviceRows = [] }: Props) {
  const viewRows = buildPartnerAllRows({
    periods: meta.periods,
    rows,
    deviceRows,
  });

  return (
    <div className="overflow-auto border rounded bg-white">
      <div className="px-3 py-2 border-b bg-gray-50 text-sm font-semibold">
        거래처 전체 ({meta.periodStart} ~ {meta.periodEnd})
      </div>

      <table className="w-max min-w-full border-collapse table-auto text-xs">
        <PartnerAllHeader periods={meta.periods} />
        <PartnerAllBody periods={meta.periods} rows={viewRows} />
      </table>
    </div>
  );
}