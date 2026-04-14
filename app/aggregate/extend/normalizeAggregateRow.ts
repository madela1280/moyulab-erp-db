import { resolveAggregateDates } from "@/aggregate/extend/resolveAggregateDates";

export type AggregateRawRow = {
  start_date: string;
  request_date: string;
  complete_date: string;
  end_date: string;
  partner_category: string;
  receiver_name: string;
  product_name: string;
  device_no: string;
  rent_kind: string;
  data?: Record<string, any>;
};

export type NormalizedAggregateRow = {
  start: Date;
  end: Date;
  partnerCategory: string;
  receiverName: string;
  productName: string;
  deviceNo: string;
  rentKind: string;
  sourceData: Record<string, any>;
};

export function normalizeAggregateRow(row: AggregateRawRow): {
  ok: boolean;
  value?: NormalizedAggregateRow;
  reason?: string;
} {
  const partnerCategory = String(row.partner_category ?? "").trim();
  const receiverName = String(row.receiver_name ?? "").trim();
  const isNursery = partnerCategory.startsWith("조리원");

  const resolved = resolveAggregateDates({
    startDateRaw: row.start_date,
    requestDateRaw: row.request_date,
    completeDateRaw: row.complete_date,
    endDateRaw: row.end_date,
    isNursery,
  });

  if (resolved.excluded || !resolved.start || !resolved.end) {
    return { ok: false, reason: resolved.reason };
  }

  return {
    ok: true,
    value: {
      start: resolved.start,
      end: resolved.end,
      partnerCategory,
      receiverName,
      productName: String(row.product_name ?? "").trim(),
      deviceNo: String(row.device_no ?? "").trim(),
      rentKind: String(row.rent_kind ?? "").trim(),
      sourceData: row.data || {},
    },
  };
}