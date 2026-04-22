import type {
  AggregateGranularity,
  AggregateRunRequest,
} from "@/aggregate/run/types.aggregateRun";

export type AggregateCorePriceKind = "rent" | "extend";

export type AggregateCoreBucket = "온라인" | "보건소" | "조리원" | "개인" | "기타";

export type AggregateCoreRentKind = "구매" | "렌탈" | "";

export type AggregateCorePeriod = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

export type AggregateCoreCellValue = {
  출고: number;
  대여일수: number;
  금액: number;
};

export type AggregateCoreRawRow = {
  start_date: string;
  request_date: string;
  complete_date: string;
  end_date: string;
  partner_category: string;
  receiver_name: string;
  product_name: string;
  device_no: string;
  rent_kind: string;
};

export type AggregateCorePartnerSettingInfo = {
  l1: string;
  l2: string;
};

export type AggregateCorePumpPricePair = {
  rent: number;
  extend: number;
};

export type AggregateCorePartnerCategoryMap = Map<string, string>;

export type AggregateCorePartnerSettingsMap = Map<string, AggregateCorePartnerSettingInfo>;

export type AggregateCorePumpPriceMap = Map<string, Map<string, AggregateCorePumpPricePair>>;

export type AggregateCorePriceMissSample = {
  partnerName: string;
  pumpModel: string;
  rawProductName: string;
};

export type AggregateCoreNormalizedEvent = {
  rawPartnerCategory: string;
  receiverName: string;
  partnerName: string;
  bucket: AggregateCoreBucket;
  partnerDisplayLabel: string;
  pumpModel: string;
  rawProductName: string;
  deviceNo: string;
  rentKind: AggregateCoreRentKind;
  personKey: string;
  startDt: Date;
  endDt: Date;
};

export type AggregateCoreComputedEvent = AggregateCoreNormalizedEvent & {
  dayPrice: number;
  pricePartnerKeys: string[];
  dedupKey: string;
};

export type AggregateCoreFilters = AggregateRunRequest["필터"];
export type AggregateCoreSearch = AggregateRunRequest["검색"];

export type AggregateCoreComputeInput = {
  rows: AggregateCoreRawRow[];
  periodStart: Date;
  periodEnd: Date;
  granularity: AggregateGranularity | string;
  filters: AggregateCoreFilters;
  search: AggregateCoreSearch;
  partnerCategoryMap?: AggregateCorePartnerCategoryMap;
  partnerSettingsMap?: AggregateCorePartnerSettingsMap;
  pumpPriceMap: AggregateCorePumpPriceMap;
};

export type AggregateCoreComputeResult = {
  periods: AggregateCorePeriod[];
  events: AggregateCoreComputedEvent[];
  priceMissCount: number;
  priceMissSamples: AggregateCorePriceMissSample[];
};