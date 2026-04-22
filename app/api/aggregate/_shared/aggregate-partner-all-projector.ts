import type { AggregateResultRow } from "@/aggregate/run/types.aggregateResult";
import type {
  AggregateCoreBucket,
  AggregateCoreCellValue,
  AggregateCoreComputeResult,
} from "./aggregate-core.types";
import {
  addCell,
  initCell,
  makeEmptyValues,
  normalizePumpModelName,
  pumpOrderIndex,
} from "./aggregate-core.rules";
import {
  applyComputedEventToPeriodValues,
  calcValuesSum,
  hasAnyValues,
} from "./aggregate-core.compute";

type PartnerAllProjectionResult = {
  partnerBuckets: AggregateCoreBucket[];
  rows: AggregateResultRow[];
};

const PARTNER_ALL_BUCKET_ORDER: AggregateCoreBucket[] = [
  "보건소",
  "조리원",
  "온라인",
  "개인",
  "기타",
];

function makeRow(args: {
  label: string;
  bucket: AggregateCoreBucket;
  periods: AggregateCoreComputeResult["periods"];
}): AggregateResultRow {
  return {
    // 거래처 전체 전용 화면은 기존 UI가 pumpModel 필드를 "표시 라벨"로 사용함
    pumpModel: args.label,
    partnerCategory: args.bucket,
    values: makeEmptyValues(args.periods),
    sum: initCell(),
  };
}

function addValuesInto(args: {
  target: Record<string, AggregateCoreCellValue>;
  source: Record<string, AggregateCoreCellValue>;
  periods: AggregateCoreComputeResult["periods"];
}) {
  for (const p of args.periods) {
    const targetCell = args.target[p.key] || initCell();
    addCell(targetCell, args.source[p.key] || initCell());
    args.target[p.key] = targetCell;
  }
}

function resolvePartnerAllLabel(args: {
  bucket: AggregateCoreBucket;
  partnerDisplayLabel: string;
  pumpModel: string;
}) {
  if (args.bucket === "보건소" || args.bucket === "조리원") {
    return String(args.partnerDisplayLabel ?? "").trim() || args.bucket;
  }

  if (args.bucket === "온라인" || args.bucket === "개인") {
    return normalizePumpModelName(args.pumpModel);
  }

  return "기타";
}

export function projectAggregatePartnerAll(
  computed: AggregateCoreComputeResult
): PartnerAllProjectionResult {
  const rowMap = new Map<string, AggregateResultRow>();

  for (const event of computed.events) {
    const label = resolvePartnerAllLabel({
      bucket: event.bucket,
      partnerDisplayLabel: event.partnerDisplayLabel,
      pumpModel: event.pumpModel,
    });

    // 기타는 항상 1줄 통합
    const rowKey =
      event.bucket === "기타"
        ? `기타||기타`
        : `${event.bucket}||${label}`;

    if (!rowMap.has(rowKey)) {
      rowMap.set(
        rowKey,
        makeRow({
          label,
          bucket: event.bucket,
          periods: computed.periods,
        })
      );
    }

    const row = rowMap.get(rowKey)!;
    applyComputedEventToPeriodValues({
      event,
      periods: computed.periods,
      values: row.values,
    });
  }

  const rows = Array.from(rowMap.values())
    .map((row) => {
      row.sum = calcValuesSum({
        periods: computed.periods,
        values: row.values,
      });
      return row;
    })
    .filter((row) =>
      hasAnyValues({
        periods: computed.periods,
        values: row.values,
      })
    )
    .sort((a, b) => {
      const ab = PARTNER_ALL_BUCKET_ORDER.indexOf(a.partnerCategory as AggregateCoreBucket);
      const bb = PARTNER_ALL_BUCKET_ORDER.indexOf(b.partnerCategory as AggregateCoreBucket);
      if (ab !== bb) return ab - bb;

      if (a.partnerCategory === "온라인" || a.partnerCategory === "개인") {
        const ap = pumpOrderIndex(a.pumpModel);
        const bp = pumpOrderIndex(b.pumpModel);
        if (ap !== bp) return ap - bp;
      }

      if (a.partnerCategory === "기타" && b.partnerCategory === "기타") {
        return 0;
      }

      return String(a.pumpModel ?? "").localeCompare(String(b.pumpModel ?? ""), "ko");
    });

  // 기타가 여러 경로로 들어오더라도 최종 1줄 보장
  const mergedRows: AggregateResultRow[] = [];
  let mergedEtc: AggregateResultRow | null = null;

  for (const row of rows) {
    if (row.partnerCategory !== "기타") {
      mergedRows.push(row);
      continue;
    }

    if (!mergedEtc) {
      mergedEtc = makeRow({
        label: "기타",
        bucket: "기타",
        periods: computed.periods,
      });
    }

    addValuesInto({
      target: mergedEtc.values,
      source: row.values,
      periods: computed.periods,
    });
  }

  if (mergedEtc) {
    mergedEtc.sum = calcValuesSum({
      periods: computed.periods,
      values: mergedEtc.values,
    });

    if (
      hasAnyValues({
        periods: computed.periods,
        values: mergedEtc.values,
      })
    ) {
      mergedRows.push(mergedEtc);
    }
  }

  return {
    partnerBuckets: [...PARTNER_ALL_BUCKET_ORDER],
    rows: mergedRows,
  };
}