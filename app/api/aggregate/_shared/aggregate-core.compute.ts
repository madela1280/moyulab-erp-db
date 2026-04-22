import type {
  AggregateCoreCellValue,
  AggregateCoreComputeInput,
  AggregateCoreComputeResult,
  AggregateCoreComputedEvent,
  AggregateCorePeriod,
} from "./aggregate-core.types";
import {
  addCell,
  buildEventDedupKey,
  buildPeriods,
  initCell,
  makeEmptyValues,
  matchesAggregateFiltersAndSearch,
  normalizeAggregateEvent,
  overlapDaysInclusive,
  resolveRentDayPrice,
} from "./aggregate-core.rules";

function shouldApplyDedup(event: AggregateCoreComputedEvent) {
  // 현재 기준 엔진은 기존 유축기 집계와의 연속성을 위해 조리원만 dedup 적용
  // 이후 운영 규칙이 확정되면 이 함수만 수정
  return event.bucket === "조리원";
}

export function computeAggregateCore(input: AggregateCoreComputeInput): AggregateCoreComputeResult {
  const periods = buildPeriods(input.periodStart, input.periodEnd, input.granularity);
  const events: AggregateCoreComputedEvent[] = [];

  let priceMissCount = 0;
  const priceMissSamples: AggregateCoreComputeResult["priceMissSamples"] = [];
  const dedupSet = new Set<string>();

  for (const row of input.rows || []) {
    const normalized = normalizeAggregateEvent({
      row,
      partnerCategoryMap: input.partnerCategoryMap,
      partnerSettingsMap: input.partnerSettingsMap,
    });
    if (!normalized) continue;

    if (
      !matchesAggregateFiltersAndSearch({
        event: normalized,
        filters: input.filters,
        search: input.search,
      })
    ) {
      continue;
    }

    const priceResolved = resolveRentDayPrice({
      pumpPriceMap: input.pumpPriceMap,
      event: normalized,
    });

    if (!priceResolved.dayPrice) {
      priceMissCount += 1;

      if (priceMissSamples.length < 20) {
        priceMissSamples.push({
          partnerName: normalized.partnerName,
          pumpModel: normalized.pumpModel,
          rawProductName: normalized.rawProductName,
        });
      }
      continue;
    }

    const computed: AggregateCoreComputedEvent = {
      ...normalized,
      dayPrice: priceResolved.dayPrice,
      pricePartnerKeys: priceResolved.partnerKeys,
      dedupKey: buildEventDedupKey(normalized),
    };

    if (shouldApplyDedup(computed)) {
      if (dedupSet.has(computed.dedupKey)) continue;
      dedupSet.add(computed.dedupKey);
    }

    events.push(computed);
  }

  return {
    periods,
    events,
    priceMissCount,
    priceMissSamples,
  };
}

export function applyComputedEventToPeriodValues(args: {
  event: AggregateCoreComputedEvent;
  periods: AggregateCorePeriod[];
  values: Record<string, AggregateCoreCellValue>;
}) {
  const { event, periods, values } = args;

  for (const p of periods) {
    const overlap = overlapDaysInclusive(event.startDt, event.endDt, p.start, p.end);
    if (overlap <= 0) continue;

    const cell = values[p.key] || initCell();

    if (event.startDt.getTime() >= p.start.getTime() && event.startDt.getTime() <= p.end.getTime()) {
      cell.출고 += 1;
    }

    cell.대여일수 += overlap;
    cell.금액 += overlap * event.dayPrice;

    values[p.key] = cell;
  }
}

export function buildPeriodValuesFromComputedEvent(args: {
  event: AggregateCoreComputedEvent;
  periods: AggregateCorePeriod[];
}) {
  const values = makeEmptyValues(args.periods);
  applyComputedEventToPeriodValues({
    event: args.event,
    periods: args.periods,
    values,
  });
  return values;
}

export function calcValuesSum(args: {
  periods: AggregateCorePeriod[];
  values: Record<string, AggregateCoreCellValue>;
}) {
  const sum = initCell();
  for (const p of args.periods) {
    addCell(sum, args.values[p.key] || initCell());
  }
  return sum;
}

export function hasAnyCellValue(cell: AggregateCoreCellValue | null | undefined) {
  const out = Number(cell?.출고 ?? 0);
  const days = Number(cell?.대여일수 ?? 0);
  const amount = Number(cell?.금액 ?? 0);
  return out !== 0 || days !== 0 || amount !== 0;
}

export function hasAnyValues(args: {
  periods: AggregateCorePeriod[];
  values: Record<string, AggregateCoreCellValue>;
}) {
  for (const p of args.periods) {
    if (hasAnyCellValue(args.values[p.key])) return true;
  }
  return false;
}