import type {
  AggregateCompareResult,
  AggregatePeriodMeta,
  AggregateResultRow,
} from "@/aggregate/run/types.aggregateResult";

export type AggregateSubtotalCompareMetric = {
  current: number;
  compare: number;
  delta: number;
  max: number;
};

export type AggregateSubtotalComparePeriod = {
  key: string;
  출고수량: AggregateSubtotalCompareMetric;
  대여일수: AggregateSubtotalCompareMetric;
  금액: AggregateSubtotalCompareMetric;
};

export type AggregateSubtotalCompareSet = {
  pumpModel: string;
  compareLabel: string;
  periods: AggregateSubtotalComparePeriod[];
  sum: {
    출고수량: AggregateSubtotalCompareMetric;
    대여일수: AggregateSubtotalCompareMetric;
    금액: AggregateSubtotalCompareMetric;
  };
};

function toSafeNumber(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function emptyMetric(max = 0): AggregateSubtotalCompareMetric {
  return {
    current: 0,
    compare: 0,
    delta: 0,
    max,
  };
}

function emptySubtotalRow(pumpModel: string): AggregateResultRow {
  return {
    pumpModel,
    partnerCategory: "소계",
    values: {},
    sum: { 출고: 0, 대여일수: 0, 금액: 0 },
  };
}

function getSubtotalRowMap(rows: AggregateResultRow[]) {
  const map = new Map<string, AggregateResultRow>();

  for (const row of rows || []) {
    if (row.partnerCategory !== "소계") continue;
    const pumpModel = String(row.pumpModel ?? "").trim();
    if (!pumpModel) continue;
    map.set(pumpModel, row);
  }

  return map;
}

function getCellValue(
  row: AggregateResultRow | undefined,
  periodKey: string | undefined
): { 출고: number; 대여일수: number; 금액: number } {
  if (!row || !periodKey) {
    return { 출고: 0, 대여일수: 0, 금액: 0 };
  }

  const cell = row.values?.[periodKey];
  return {
    출고: toSafeNumber(cell?.출고),
    대여일수: toSafeNumber(cell?.대여일수),
    금액: toSafeNumber(cell?.금액),
  };
}

function makeMetric(current: number, compare: number, max: number): AggregateSubtotalCompareMetric {
  return {
    current,
    compare,
    delta: current - compare,
    max: Math.max(0, max),
  };
}

function buildCompareSetForPump(args: {
  pumpModel: string;
  mainPeriods: AggregatePeriodMeta[];
  mainRow: AggregateResultRow;
  compareResult: AggregateCompareResult;
  compareRow?: AggregateResultRow;
}): AggregateSubtotalCompareSet {
  const { pumpModel, mainPeriods, mainRow, compareResult } = args;
  const compareRow = args.compareRow ?? emptySubtotalRow(pumpModel);

  let periodMax출고 = 0;
  let periodMax대여일수 = 0;
  let periodMax금액 = 0;

  const periodPairs = mainPeriods.map((mainPeriod, index) => {
    const comparePeriod = compareResult.periods?.[index];
    const currentCell = getCellValue(mainRow, mainPeriod.key);
    const compareCell = getCellValue(compareRow, comparePeriod?.key);

    periodMax출고 = Math.max(periodMax출고, currentCell.출고, compareCell.출고);
    periodMax대여일수 = Math.max(
      periodMax대여일수,
      currentCell.대여일수,
      compareCell.대여일수
    );
    periodMax금액 = Math.max(periodMax금액, currentCell.금액, compareCell.금액);

    return {
      key: mainPeriod.key,
      currentCell,
      compareCell,
    };
  });

  const currentSum출고 = toSafeNumber(mainRow.sum?.출고);
  const currentSum대여일수 = toSafeNumber(mainRow.sum?.대여일수);
  const currentSum금액 = toSafeNumber(mainRow.sum?.금액);

  const compareSum출고 = toSafeNumber(compareRow.sum?.출고);
  const compareSum대여일수 = toSafeNumber(compareRow.sum?.대여일수);
  const compareSum금액 = toSafeNumber(compareRow.sum?.금액);

  const sumMax출고 = Math.max(currentSum출고, compareSum출고);
  const sumMax대여일수 = Math.max(currentSum대여일수, compareSum대여일수);
  const sumMax금액 = Math.max(currentSum금액, compareSum금액);

  const periods: AggregateSubtotalComparePeriod[] = periodPairs.map((pair) => ({
    key: pair.key,
    출고수량: makeMetric(pair.currentCell.출고, pair.compareCell.출고, periodMax출고),
    대여일수: makeMetric(
      pair.currentCell.대여일수,
      pair.compareCell.대여일수,
      periodMax대여일수
    ),
    금액: makeMetric(pair.currentCell.금액, pair.compareCell.금액, periodMax금액),
  }));

  return {
    pumpModel,
    compareLabel: `${compareResult.label} (${compareResult.periodStart} ~ ${compareResult.periodEnd})`,
    periods,
    sum: {
      출고수량:
        sumMax출고 > 0
          ? makeMetric(currentSum출고, compareSum출고, sumMax출고)
          : emptyMetric(0),
      대여일수:
        sumMax대여일수 > 0
          ? makeMetric(currentSum대여일수, compareSum대여일수, sumMax대여일수)
          : emptyMetric(0),
      금액:
        sumMax금액 > 0
          ? makeMetric(currentSum금액, compareSum금액, sumMax금액)
          : emptyMetric(0),
    },
  };
}

export function buildSubtotalCompareMap(args: {
  mainPeriods: AggregatePeriodMeta[];
  rows: AggregateResultRow[];
  compareResults: AggregateCompareResult[];
}) {
  const { mainPeriods, rows, compareResults } = args;

  const resultMap = new Map<string, AggregateSubtotalCompareSet[]>();

  if (!Array.isArray(mainPeriods) || mainPeriods.length === 0) return resultMap;
  if (!Array.isArray(rows) || rows.length === 0) return resultMap;
  if (!Array.isArray(compareResults) || compareResults.length === 0) return resultMap;

  const mainSubtotalMap = getSubtotalRowMap(rows);
  if (mainSubtotalMap.size === 0) return resultMap;

  for (const [pumpModel, mainRow] of mainSubtotalMap.entries()) {
    const compareSets: AggregateSubtotalCompareSet[] = [];

    for (const compareResult of compareResults) {
      const compareSubtotalMap = getSubtotalRowMap(compareResult.rows || []);
      const compareRow = compareSubtotalMap.get(pumpModel);

      compareSets.push(
        buildCompareSetForPump({
          pumpModel,
          mainPeriods,
          mainRow,
          compareResult,
          compareRow,
        })
      );
    }

    resultMap.set(pumpModel, compareSets);
  }

  return resultMap;
}