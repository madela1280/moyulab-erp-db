// app/aggregate/run/types.aggregateResult.ts

export type AggregateCellValue = {
  출고: number;
  대여일수: number;
  금액: number;
};

export type AggregatePeriodMeta = {
  key: string;
  label: string;
  start: string;
  end: string;
};

export type AggregateResultRow = {
  pumpModel: string;
  partnerCategory: string;
  values: Record<string, AggregateCellValue>;
  sum: AggregateCellValue;
};

export type AggregateCompareResult = {
  label: string;
  periodStart: string;
  periodEnd: string;
  periods: AggregatePeriodMeta[];
  rows: AggregateResultRow[];
};

export type AggregateDeviceRow = {
  pumpModel: string;
  partnerCategory: string;
  deviceNo: string;
  rentKind?: "구매" | "렌탈" | "";
  values: Record<string, AggregateCellValue>;
  sum: AggregateCellValue;
};

export type AggregateDeviceCompareResult = {
  label: string;
  periodStart: string;
  periodEnd: string;
  periods: AggregatePeriodMeta[];
  rows: AggregateDeviceRow[];
};

export type AggregateRunResponse = {
  ok: true;
  meta: {
    granularity: string;
    periodStart: string;
    periodEnd: string;
    periods: AggregatePeriodMeta[];
    partnerBuckets: string[];
    pumpScope?: "전체" | "기종";
    selectedPumpModel?: string;
  };
  rows: AggregateResultRow[];
  compareResults: AggregateCompareResult[];

  deviceRows?: AggregateDeviceRow[];
  deviceCompareResults?: AggregateDeviceCompareResult[];
};