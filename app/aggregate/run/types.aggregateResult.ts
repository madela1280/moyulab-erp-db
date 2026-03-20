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

export type AggregateRunResponse = {
  ok: true;
  meta: {
    granularity: string;
    periodStart: string;
    periodEnd: string;
    periods: AggregatePeriodMeta[];
    partnerBuckets: string[];
  };
  rows: AggregateResultRow[];
  compareResults: AggregateCompareResult[];
};