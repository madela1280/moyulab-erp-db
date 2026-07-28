// app/backupRestore/history-restore/HistoryPastGrid.tsx

"use client";

import { useMemo } from "react";
import * as unifiedColumnsModule from "@/unified/columns/unifiedColumns";
import {
  type HistoryOperationDetailResponse,
  type HistoryOperationItem,
} from "./serviceHistoryRestore";

type HistoryPastGridProps = {
  detail: HistoryOperationDetailResponse | null;
};

type PastGridRow = {
  unified_id: number;
  row_number: number | null;
  rowData: Record<string, any>;
};

type UnifiedColumnLike = {
  key?: any;
  id?: any;
  accessorKey?: any;
  name?: any;
  label?: any;
  title?: any;
  width?: any;
  defaultWidth?: any;
  size?: any;
};

function cleanColumnText(v: any) {
  return String(v ?? "").trim();
}

function isColumnObject(v: any): v is UnifiedColumnLike {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function getUnifiedColumnKey(column: any) {
  if (typeof column === "string") return cleanColumnText(column);

  if (!isColumnObject(column)) return "";

  const candidates = [
    column.key,
    column.id,
    column.accessorKey,
    column.name,
    column.label,
    column.title,
  ];

  for (const candidate of candidates) {
    const text = cleanColumnText(candidate);
    if (text) return text;
  }

  return "";
}

function getUnifiedColumnWidthFromDef(column: any) {
  if (!isColumnObject(column)) return null;

  const candidates = [
    column.width,
    column.defaultWidth,
    column.size,
  ];

  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }

  return null;
}

function getUnifiedColumnSourceArray() {
  const values = Object.values(unifiedColumnsModule as Record<string, any>);
  const arrays = values.filter((value) => Array.isArray(value));

  if (!arrays.length) return [];

  const scored = arrays
    .map((arr) => {
      const keys = arr.map(getUnifiedColumnKey).filter(Boolean);
      const score =
        keys.length +
        (keys.includes("거래처분류") ? 1000 : 0) +
        (keys.includes("반납완료일") ? 1000 : 0) +
        (keys.includes("특이사항2") ? 1000 : 0) +
        (keys.includes("15차연장") ? 1000 : 0);

      return { arr, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.arr ?? [];
}

const UNIFIED_COLUMN_DEFS = getUnifiedColumnSourceArray();

const UNIFIED_COLUMN_KEYS = UNIFIED_COLUMN_DEFS
  .map(getUnifiedColumnKey)
  .filter(Boolean);

const UNIFIED_COLUMN_WIDTH_MAP: Record<string, number> = {};

for (const column of UNIFIED_COLUMN_DEFS) {
  const key = getUnifiedColumnKey(column);
  const width = getUnifiedColumnWidthFromDef(column);

  if (key && width) {
    UNIFIED_COLUMN_WIDTH_MAP[key] = width;
  }
}

function getColumnWidth(columnKey: string) {
  return UNIFIED_COLUMN_WIDTH_MAP[columnKey] ?? 120;
}

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

function shortValue(value: any) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    const text = JSON.stringify(value);
    if (text.length > 160) return text.slice(0, 160) + "...";
    return text;
  } catch {
    return String(value);
  }
}

function getPastRowData(item: HistoryOperationItem) {
  const actionType = normalizeString(item.action_type);

  if (actionType === "bulk_delete") {
    if (isPlainObject(item.before_row_data)) return item.before_row_data;
    if (isPlainObject(item.after_row_data)) return item.after_row_data;
    return {};
  }

  if (isPlainObject(item.after_row_data)) return item.after_row_data;
  if (isPlainObject(item.before_row_data)) return item.before_row_data;
  return {};
}

function buildColumns(rows: PastGridRow[], items: HistoryOperationItem[]) {
  const keySet = new Set<string>();

  for (const key of UNIFIED_COLUMN_KEYS) {
    keySet.add(key);
  }

  for (const item of items || []) {
    const columnKey = normalizeString(item.column_key);
    if (columnKey) keySet.add(columnKey);
  }

  for (const row of rows) {
    for (const key of Object.keys(row.rowData || {})) {
      const cleanKey = normalizeString(key);
      if (cleanKey) keySet.add(cleanKey);
    }
  }

  const allKeys = Array.from(keySet);

  const preferred = UNIFIED_COLUMN_KEYS.filter((key) =>
    allKeys.includes(key)
  );

  const extra = allKeys
    .filter((key) => !UNIFIED_COLUMN_KEYS.includes(key))
    .sort((a, b) => a.localeCompare(b, "ko"));

  return [...preferred, ...extra];
}

function buildPastGridModel(detail: HistoryOperationDetailResponse | null) {
  const rowMap = new Map<number, PastGridRow>();
  const changedCellSet = new Set<string>();
  const changedRowSet = new Set<number>();

  const items = detail?.items || [];

  for (const item of items) {
    const unifiedId = Number(item.unified_id);

    if (!Number.isFinite(unifiedId) || unifiedId <= 0) continue;

    const rowData = getPastRowData(item);
    const columnKey = normalizeString(item.column_key);

    const prev = rowMap.get(unifiedId);

    if (!prev) {
      rowMap.set(unifiedId, {
        unified_id: unifiedId,
        row_number:
          Number.isFinite(Number((item as any).row_number)) && Number((item as any).row_number) > 0
            ? Math.floor(Number((item as any).row_number))
            : null,
        rowData,
      });
    } else {
      const prevKeyCount = Object.keys(prev.rowData || {}).length;
      const nextKeyCount = Object.keys(rowData || {}).length;

      rowMap.set(unifiedId, {
        unified_id: unifiedId,
        row_number:
          prev.row_number ??
          (
            Number.isFinite(Number((item as any).row_number)) &&
            Number((item as any).row_number) > 0
              ? Math.floor(Number((item as any).row_number))
              : null
          ),
        rowData: nextKeyCount >= prevKeyCount ? rowData : prev.rowData,
      });
    }

    if (columnKey) {
      changedCellSet.add(`${unifiedId}::${columnKey}`);
    } else {
      changedRowSet.add(unifiedId);
    }
  }

  const rows = Array.from(rowMap.values()).sort(
    (a, b) => a.unified_id - b.unified_id
  );

  const columns = buildColumns(rows, items);

  return {
    rows,
    columns,
    changedCellSet,
    changedRowSet,
  };
}

export default function HistoryPastGrid({ detail }: HistoryPastGridProps) {
  const { rows, columns, changedCellSet, changedRowSet } = useMemo(() => {
    return buildPastGridModel(detail);
  }, [detail]);

  if (!detail) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">
        왼쪽 작업목록에서 작업을 선택하면 과거시점 통합관리 화면이 표시됩니다.
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">
        이 작업에서 표시할 통합관리 행을 찾지 못했습니다.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-800">
              과거시점 통합관리 화면
            </div>
            <div className="mt-1 text-xs text-slate-500">
              선택한 작업에 포함된 행만 통합관리 컬럼 형태로 표시합니다. 이 화면은 읽기전용입니다.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-600">
              행 {rows.length}건
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-600">
              컬럼 {columns.length}개
            </span>
          </div>
        </div>
      </div>

      <div className="max-h-[360px] overflow-auto">
        <table className="min-w-max w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr className="border-b border-slate-200 text-slate-600">
            <th className="sticky left-0 z-20 w-[70px] border-r border-slate-200 bg-slate-100 px-2 py-2 text-left font-semibold">
                행번호
              </th>

              {columns.map((columnKey) => (
               <th
                  key={columnKey}
                  className="border-r border-slate-200 px-2 py-2 text-left font-semibold"
                  style={{
                    width: getColumnWidth(columnKey),
                    minWidth: getColumnWidth(columnKey),
                    maxWidth: getColumnWidth(columnKey),
                  }}
                  title={columnKey}
                >
                  {columnKey}
                </th>  
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const isChangedRow = changedRowSet.has(row.unified_id);

              return (
                <tr
                  key={row.unified_id}
                  className={`border-b border-slate-100 ${
                    isChangedRow ? "bg-orange-50" : "bg-white hover:bg-slate-50"
                  }`}
                >
                <td className="sticky left-0 z-10 border-r border-slate-200 bg-inherit px-2 py-2 font-semibold text-slate-700">
                    {row.row_number ?? "-"}
                  </td>

                  {columns.map((columnKey) => {
                    const cellKey = `${row.unified_id}::${columnKey}`;
                    const changed = changedCellSet.has(cellKey);
                    const value = row.rowData?.[columnKey];

                    return (
                     <td
                        key={cellKey}
                        className={`border-r border-slate-100 px-2 py-2 text-slate-700 ${
                          changed ? "bg-yellow-50 font-semibold" : ""
                        }`}
                        style={{
                          width: getColumnWidth(columnKey),
                          minWidth: getColumnWidth(columnKey),
                          maxWidth: getColumnWidth(columnKey),
                        }}
                        title={shortValue(value)}
                      >
                        <div className="truncate">
                          {shortValue(value)}
                        </div>
                      </td>  
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        노란색 셀은 선택한 작업에서 변경된 셀입니다. 행 전체 삭제/추가 이력은 행 배경으로 표시됩니다.
      </div>
    </div>
  );
}