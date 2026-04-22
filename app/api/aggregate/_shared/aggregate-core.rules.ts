import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";
import type {
  AggregateCoreBucket,
  AggregateCoreCellValue,
  AggregateCoreNormalizedEvent,
  AggregateCorePartnerCategoryMap,
  AggregateCorePartnerSettingsMap,
  AggregateCorePeriod,
  AggregateCorePumpPriceMap,
  AggregateCoreRawRow,
  AggregateCoreRentKind,
} from "./aggregate-core.types";

export const AGGREGATE_CORE_BUCKET_ORDER: AggregateCoreBucket[] = [
  "온라인",
  "보건소",
  "조리원",
  "개인",
  "기타",
];

export const AGGREGATE_CORE_PUMP_ORDER = [
  "심포니",
  "락티나",
  "스윙",
  "스윙맥시",
  "프리스타일",
  "시밀래",
  "각시밀",
] as const;

export function toISODateString(v: unknown) {
  return String(v ?? "").trim();
}

export function parseDateFlexible(v: unknown): Date | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;

  const s = raw.replaceAll(".", "-").replaceAll("/", "-");

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
      return dt;
    }
    return null;
  }

  m = s.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = 2000 + Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
      return dt;
    }
    return null;
  }

  return null;
}

export function isNonEmptyText(v: unknown) {
  return String(v ?? "").trim().length > 0;
}

export function isTextLike(v: unknown) {
  const raw = String(v ?? "").trim();
  if (!raw) return false;
  return parseDateFlexible(raw) === null;
}

export function addDaysUTC(d: Date, days: number) {
  const dt = new Date(d.getTime());
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

export function getServerTodayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export function buildPeriods(start: Date, end: Date, granularity: string): AggregateCorePeriod[] {
  const periods: AggregateCorePeriod[] = [];

  if (granularity === "기간별") {
    periods.push({
      key: "period",
      label: "기간별",
      start: new Date(start.getTime()),
      end: new Date(end.getTime()),
    });
    return periods;
  }

  if (granularity === "일별") {
    let cur = new Date(start.getTime());
    while (cur.getTime() <= end.getTime()) {
      const y = cur.getUTCFullYear();
      const mo = cur.getUTCMonth() + 1;
      const d = cur.getUTCDate();
      periods.push({
        key: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        label: `${mo}/${d}`,
        start: new Date(cur.getTime()),
        end: new Date(cur.getTime()),
      });
      cur = addDaysUTC(cur, 1);
    }
    return periods;
  }

  if (granularity === "연별") {
    let y = start.getUTCFullYear();
    const endY = end.getUTCFullYear();
    while (y <= endY) {
      periods.push({
        key: String(y),
        label: `${y}년`,
        start: new Date(Date.UTC(y, 0, 1)),
        end: new Date(Date.UTC(y, 11, 31)),
      });
      y += 1;
    }
    return periods;
  }

  let cur = startOfMonthUTC(start);
  const endMonth = startOfMonthUTC(end);
  while (cur.getTime() <= endMonth.getTime()) {
    const y = cur.getUTCFullYear();
    const mo = cur.getUTCMonth() + 1;
    periods.push({
      key: `${y}-${String(mo).padStart(2, "0")}`,
      label: `${mo}월`,
      start: startOfMonthUTC(cur),
      end: endOfMonthUTC(cur),
    });
    cur = new Date(Date.UTC(y, mo, 1));
  }

  return periods;
}

export function overlapDaysInclusive(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const s = aStart.getTime() > bStart.getTime() ? aStart : bStart;
  const e = aEnd.getTime() < bEnd.getTime() ? aEnd : bEnd;
  if (e.getTime() < s.getTime()) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

export function normalizePumpModelName(name: string) {
  const s = String(name ?? "").trim();

  if (s.includes("심포니")) return "심포니";
  if (s.includes("락티나")) return "락티나";
  if (s.includes("스윙맥") || s.includes("스윙맥시") || s.includes("스윙맥스")) return "스윙맥시";
  if (s.includes("프리스타일")) return "프리스타일";
  if (s.includes("스윙")) return "스윙";
  if (s.includes("시밀래") || s.includes("시밀레")) return "시밀래";
  if (s.includes("각시밀")) return "각시밀";

  return s || "미지정";
}

export function pumpOrderIndex(name: string) {
  const normalized = normalizePumpModelName(name);
  const idx = AGGREGATE_CORE_PUMP_ORDER.indexOf(
    normalized as (typeof AGGREGATE_CORE_PUMP_ORDER)[number]
  );
  return idx >= 0 ? idx : 999;
}

export function normalizePartnerName(rawCategory: string, rawReceiver: string) {
  const cat = String(rawCategory ?? "").trim();
  const recv = String(rawReceiver ?? "").trim();
  if (cat.startsWith("조리원")) return recv || cat;
  return cat;
}

export function normalizePartnerBucket(name: string): AggregateCoreBucket {
  const s = String(name ?? "").trim();
  if (s.startsWith("조리원")) return "조리원";
  if (s === "온라인" || s === "보건소" || s === "개인") return s;
  return "기타";
}

export function normalizeRentKind(v: string): AggregateCoreRentKind {
  const s = String(v ?? "").trim();
  if (s.includes("구매")) return "구매";
  if (s.includes("렌탈")) return "렌탈";
  return "";
}

export function normalizePersonKey(rawReceiver: string) {
  const recv = String(rawReceiver ?? "").trim();
  return recv || "-";
}

export function normalizePartnerLookupKey(rawPartner: string, receiverName: string) {
  const raw = String(rawPartner ?? "").trim();
  const recv = String(receiverName ?? "").trim();
  if (raw.startsWith("조리원")) return recv || raw;
  return raw;
}

export function shiftByMonthsUTC(d: Date, diff: number) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + diff, 1));
  const last = endOfMonthUTC(target).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last)));
}

export function shiftPeriod(start: Date, end: Date, type: "전년동일기간" | "전월동일기간") {
  if (type === "전년동일기간") {
    return {
      start: shiftByMonthsUTC(start, -12),
      end: shiftByMonthsUTC(end, -12),
    };
  }
  return {
    start: shiftByMonthsUTC(start, -1),
    end: shiftByMonthsUTC(end, -1),
  };
}

export function initCell(): AggregateCoreCellValue {
  return { 출고: 0, 대여일수: 0, 금액: 0 };
}

export function addCell(a: AggregateCoreCellValue, b: AggregateCoreCellValue) {
  a.출고 += Number(b?.출고 ?? 0);
  a.대여일수 += Number(b?.대여일수 ?? 0);
  a.금액 += Number(b?.금액 ?? 0);
}

export function makeEmptyValues(periods: AggregateCorePeriod[]) {
  const out: Record<string, AggregateCoreCellValue> = {};
  for (const p of periods) out[p.key] = initCell();
  return out;
}

export function resolvePartnerSettingInfo(args: {
  rawPartnerCategory: string;
  receiverName: string;
  partnerCategoryMap?: AggregateCorePartnerCategoryMap;
  partnerSettingsMap?: AggregateCorePartnerSettingsMap;
}) {
  const rawPartnerCategory = String(args.rawPartnerCategory ?? "").trim();
  const receiverName = String(args.receiverName ?? "").trim();
  const partnerName = normalizePartnerName(rawPartnerCategory, receiverName);
  const partnerLookupKey = normalizePartnerLookupKey(rawPartnerCategory, receiverName);

  if (args.partnerSettingsMap) {
    const found =
      args.partnerSettingsMap.get(partnerLookupKey) ||
      args.partnerSettingsMap.get(rawPartnerCategory);

    if (found) {
      return {
        partnerName,
        partnerLookupKey,
        l1: String(found.l1 ?? "").trim(),
        l2: String(found.l2 ?? "").trim(),
      };
    }
  }

  if (args.partnerCategoryMap) {
    const l1 =
      String(args.partnerCategoryMap.get(partnerName) ?? "").trim() ||
      String(args.partnerCategoryMap.get(rawPartnerCategory) ?? "").trim();

    return {
      partnerName,
      partnerLookupKey,
      l1,
      l2: "",
    };
  }

  return {
    partnerName,
    partnerLookupKey,
    l1: "",
    l2: "",
  };
}

export function resolvePartnerDisplayLabel(args: {
  rawPartnerCategory: string;
  receiverName: string;
  pumpModel: string;
  bucket: AggregateCoreBucket;
  l2?: string;
}) {
  const raw = String(args.rawPartnerCategory ?? "").trim();
  const recv = String(args.receiverName ?? "").trim();
  const l2 = String(args.l2 ?? "").trim();

  if (args.bucket === "보건소") {
    return l2 || raw || "보건소";
  }

  if (args.bucket === "조리원") {
    return l2 || recv || raw || "조리원";
  }

  if (args.bucket === "온라인" || args.bucket === "개인") {
    return normalizePumpModelName(args.pumpModel);
  }

  return "기타";
}

export function resolveEndDate(args: {
  completeDate: string;
  endDate: string;
  bucket: AggregateCoreBucket;
}) {
  const completeDt = parseDateFlexible(args.completeDate);
  const endDt = parseDateFlexible(args.endDate);

  if (completeDt) {
    return addDaysUTC(completeDt, -1);
  }

  if (isNonEmptyText(args.completeDate)) {
    return endDt;
  }

  if (args.bucket === "조리원") {
    return getServerTodayUTC();
  }

  return endDt;
}

export function normalizeAggregateEvent(args: {
  row: AggregateCoreRawRow;
  partnerCategoryMap?: AggregateCorePartnerCategoryMap;
  partnerSettingsMap?: AggregateCorePartnerSettingsMap;
}): AggregateCoreNormalizedEvent | null {
  const row = args.row;
  const startDt = parseDateFlexible(row.start_date);
  if (!startDt) return null;

  if (isTextLike(row.request_date)) return null;

  const rawPartnerCategory = String(row.partner_category ?? "").trim();
  const receiverName = String(row.receiver_name ?? "").trim();

  const setting = resolvePartnerSettingInfo({
    rawPartnerCategory,
    receiverName,
    partnerCategoryMap: args.partnerCategoryMap,
    partnerSettingsMap: args.partnerSettingsMap,
  });

  if (!setting.l1) return null;

  const bucket = normalizePartnerBucket(setting.l1);
  const endDt = resolveEndDate({
    completeDate: row.complete_date,
    endDate: row.end_date,
    bucket,
  });

  if (!endDt) return null;
  if (endDt.getTime() < startDt.getTime()) return null;

  const pumpModel = normalizePumpModelName(String(row.product_name ?? "").trim());

  return {
    rawPartnerCategory,
    receiverName,
    partnerName: setting.partnerName,
    bucket,
    partnerDisplayLabel: resolvePartnerDisplayLabel({
      rawPartnerCategory,
      receiverName,
      pumpModel,
      bucket,
      l2: setting.l2,
    }),
    pumpModel,
    rawProductName: String(row.product_name ?? "").trim(),
    deviceNo: String(row.device_no ?? "-").trim() || "-",
    rentKind: normalizeRentKind(String(row.rent_kind ?? "").trim()),
    personKey: normalizePersonKey(receiverName),
    startDt,
    endDt,
  };
}

export function matchesAggregateFiltersAndSearch(args: {
  event: AggregateCoreNormalizedEvent;
  filters: AggregateRunRequest["필터"];
  search: AggregateRunRequest["검색"];
}) {
  const { event, filters, search } = args;

  if (filters.거래처 !== "전체" && filters.거래처 !== event.bucket) {
    return false;
  }

  if (filters.유축기 === "기종" && search.유축기) {
    const selectedPump = normalizePumpModelName(search.유축기);
    if (event.pumpModel !== selectedPump) {
      return false;
    }
  }

  if (search.거래처) {
    const q = String(search.거래처).trim();
    const haystack = [
      event.rawPartnerCategory,
      event.receiverName,
      event.partnerName,
      event.partnerDisplayLabel,
      event.bucket,
    ]
      .filter(Boolean)
      .join(" ");

    if (!haystack.includes(q)) {
      return false;
    }
  }

  if (search.기기번호) {
    if (!String(event.deviceNo || "").includes(String(search.기기번호))) {
      return false;
    }
  }

  return true;
}

export function buildPriceLookupKeys(event: AggregateCoreNormalizedEvent) {
  const keys: string[] = [];
  const normalizedPartner = String(event.partnerName ?? "").trim();

  if (event.bucket === "보건소") {
    keys.push("보건소");
  }

  if (normalizedPartner) {
    keys.push(normalizedPartner);
  }

  if (
    normalizedPartner.endsWith("구") ||
    normalizedPartner.endsWith("시") ||
    normalizedPartner.endsWith("군")
  ) {
    const head = normalizedPartner.slice(0, -1).trim();
    if (head) keys.push(head);
  }

  return Array.from(new Set(keys));
}

export function resolveRentDayPrice(args: {
  pumpPriceMap: AggregateCorePumpPriceMap;
  event: AggregateCoreNormalizedEvent;
}) {
  const partnerKeys = buildPriceLookupKeys(args.event);
  const normalizedPump = normalizePumpModelName(args.event.pumpModel || args.event.rawProductName || "");

  for (const key of partnerKeys) {
    const partnerPriceMap = args.pumpPriceMap.get(key);
    if (!partnerPriceMap) continue;

    let dayPrice = Number(partnerPriceMap.get(normalizedPump)?.rent ?? 0);
    if (dayPrice > 0) {
      return {
        dayPrice,
        partnerKeys,
      };
    }

    const target = normalizePumpModelName(args.event.rawProductName || args.event.pumpModel || "");
    for (const [modelName, priceObj] of partnerPriceMap.entries()) {
      if (normalizePumpModelName(modelName) === target) {
        dayPrice = Number(priceObj?.rent ?? 0);
        if (dayPrice > 0) {
          return {
            dayPrice,
            partnerKeys,
          };
        }
      }
    }
  }

  return {
    dayPrice: 0,
    partnerKeys,
  };
}

export function buildEventDedupKey(event: AggregateCoreNormalizedEvent) {
  return [
    event.personKey,
    `${event.startDt.toISOString().slice(0, 10)}~${event.endDt.toISOString().slice(0, 10)}`,
    event.deviceNo || "-",
  ].join("||");
}