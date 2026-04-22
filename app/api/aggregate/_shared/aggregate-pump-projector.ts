import type {
  AggregateDeviceRow,
  AggregateResultRow,
} from "@/aggregate/run/types.aggregateResult";
import type {
  AggregateCoreBucket,
  AggregateCoreCellValue,
  AggregateCoreComputeResult,
} from "./aggregate-core.types";
import {
  AGGREGATE_CORE_BUCKET_ORDER,
  addCell,
  initCell,
  makeEmptyValues,
  pumpOrderIndex,
} from "./aggregate-core.rules";
import {
  applyComputedEventToPeriodValues,
  calcValuesSum,
} from "./aggregate-core.compute";

type PumpProjectionResult = {
  partnerBuckets: AggregateCoreBucket[];
  rows: AggregateResultRow[];
  deviceRows: AggregateDeviceRow[];
};

function makeEmptyRow(args: {
  pumpModel: string;
  partnerCategory: string;
  periods: AggregateCoreComputeResult["periods"];
}): AggregateResultRow {
  return {
    pumpModel: args.pumpModel,
    partnerCategory: args.partnerCategory,
    values: makeEmptyValues(args.periods),
    sum: initCell(),
  };
}

function makeEmptyDeviceRow(args: {
  pumpModel: string;
  partnerCategory: string;
  deviceNo: string;
  rentKind: "구매" | "렌탈" | "";
  periods: AggregateCoreComputeResult["periods"];
}): AggregateDeviceRow {
  return {
    pumpModel: args.pumpModel,
    partnerCategory: args.partnerCategory,
    deviceNo: args.deviceNo,
    rentKind: args.rentKind,
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

export function projectAggregatePump(
  computed: AggregateCoreComputeResult
): PumpProjectionResult {
  const valuesByPump = new Map<string, Map<string, AggregateResultRow>>();
  const deviceMap = new Map<string, AggregateDeviceRow>();

  function getMainRow(pumpModel: string, partnerCategory: string) {
    if (!valuesByPump.has(pumpModel)) {
      valuesByPump.set(pumpModel, new Map());
    }

    const byPartner = valuesByPump.get(pumpModel)!;
    if (!byPartner.has(partnerCategory)) {
      byPartner.set(
        partnerCategory,
        makeEmptyRow({
          pumpModel,
          partnerCategory,
          periods: computed.periods,
        })
      );
    }

    return byPartner.get(partnerCategory)!;
  }

  for (const event of computed.events) {
    const mainRow = getMainRow(event.pumpModel, event.bucket);

    applyComputedEventToPeriodValues({
      event,
      periods: computed.periods,
      values: mainRow.values,
    });

    const deviceKey = [
      event.pumpModel,
      event.bucket,
      event.deviceNo,
      event.rentKind,
    ].join("||");

    if (!deviceMap.has(deviceKey)) {
      deviceMap.set(
        deviceKey,
        makeEmptyDeviceRow({
          pumpModel: event.pumpModel,
          partnerCategory: event.bucket,
          deviceNo: event.deviceNo,
          rentKind: event.rentKind,
          periods: computed.periods,
        })
      );
    }

    const deviceRow = deviceMap.get(deviceKey)!;
    applyComputedEventToPeriodValues({
      event,
      periods: computed.periods,
      values: deviceRow.values,
    });
  }

  const pumpModels = Array.from(valuesByPump.keys()).sort((a, b) => {
    const ai = pumpOrderIndex(a);
    const bi = pumpOrderIndex(b);
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b, "ko");
  });

  const rowsOut: AggregateResultRow[] = [];

  for (const pumpModel of pumpModels) {
    const rowMap = valuesByPump.get(pumpModel)!;

    for (const bucket of AGGREGATE_CORE_BUCKET_ORDER) {
      if (!rowMap.has(bucket)) {
        rowMap.set(
          bucket,
          makeEmptyRow({
            pumpModel,
            partnerCategory: bucket,
            periods: computed.periods,
          })
        );
      }
    }

    for (const row of rowMap.values()) {
      row.sum = calcValuesSum({
        periods: computed.periods,
        values: row.values,
      });
    }

    for (const bucket of AGGREGATE_CORE_BUCKET_ORDER) {
      rowsOut.push(rowMap.get(bucket)!);
    }

    const subtotal = makeEmptyRow({
      pumpModel,
      partnerCategory: "소계",
      periods: computed.periods,
    });

    for (const bucket of AGGREGATE_CORE_BUCKET_ORDER) {
      const row = rowMap.get(bucket)!;
      addValuesInto({
        target: subtotal.values,
        source: row.values,
        periods: computed.periods,
      });
    }

    subtotal.sum = calcValuesSum({
      periods: computed.periods,
      values: subtotal.values,
    });

    rowsOut.push(subtotal);
  }

  const deviceRows = Array.from(deviceMap.values())
    .map((row) => {
      row.sum = calcValuesSum({
        periods: computed.periods,
        values: row.values,
      });
      return row;
    })
    .sort((a, b) => {
      const ai = pumpOrderIndex(a.pumpModel);
      const bi = pumpOrderIndex(b.pumpModel);
      if (ai !== bi) return ai - bi;

      const ab = AGGREGATE_CORE_BUCKET_ORDER.indexOf(a.partnerCategory as AggregateCoreBucket);
      const bb = AGGREGATE_CORE_BUCKET_ORDER.indexOf(b.partnerCategory as AggregateCoreBucket);
      if (ab !== bb) return ab - bb;

      const ad = String(a.deviceNo ?? "");
      const bd = String(b.deviceNo ?? "");
      if (ad !== bd) return ad.localeCompare(bd, "ko");

      return String(a.rentKind ?? "").localeCompare(String(b.rentKind ?? ""), "ko");
    });

  return {
    partnerBuckets: [...AGGREGATE_CORE_BUCKET_ORDER],
    rows: rowsOut,
    deviceRows,
  };
}