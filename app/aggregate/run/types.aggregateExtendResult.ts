export type AggregateExtendCellValue = {
  출고수량: number;
  대여일수: number;
  금액: number;
};

export type AggregateExtendPeriodMeta = {
  key: string;
  label: string;
};

export type AggregateExtendResultRow = {
  pumpModel: string;
  partnerCategory: string;
  values: Record<string, AggregateExtendCellValue>;
  sum: AggregateExtendCellValue;
  weight: number;
};

export type AggregateRunExtendResponse = {
  ok: true;
  meta: {
    periodStart: string;
    periodEnd: string;
    periods: AggregateExtendPeriodMeta[];
  };
  rows: AggregateExtendResultRow[];
};