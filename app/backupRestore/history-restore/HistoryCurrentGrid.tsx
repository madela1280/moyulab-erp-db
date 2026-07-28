// app/backupRestore/history-restore/HistoryCurrentGrid.tsx

"use client";

import { useMemo } from "react";
import * as unifiedColumnsModule from "@/unified/columns/unifiedColumns";
import { type HistoryOperationDetailResponse } from "./serviceHistoryRestore";
import { useHistoryCurrentEdit } from "./useHistoryCurrentEdit";

type HistoryCurrentGridProps = {
  detail: HistoryOperationDetailResponse | null;
  loading?: boolean;
  onSaved?: () => void | Promise<void>;
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

function buildColumns(detail: HistoryOperationDetailResponse | null) {
  const keySet = new Set<string>();

  for (const key of UNIFIED_COLUMN_KEYS) {
    keySet.add(key);
  }

  for (const item of detail?.items || []) {
    const columnKey = normalizeString(item.column_key);
    if (columnKey) keySet.add(columnKey);

    const currentRowData = item.current_row_data || {};
    for (const key of Object.keys(currentRowData)) {
      const cleanKey = normalizeString(key);
      if (cleanKey) keySet.add(cleanKey);
    }

    const afterRowData = item.after_row_data || {};
    for (const key of Object.keys(afterRowData)) {
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

export default function HistoryCurrentGrid({
  detail,
  loading = false,
  onSaved,
}: HistoryCurrentGridProps) {
  const columns = useMemo(() => buildColumns(detail), [detail]);

  const {
    rows,
    selectedCell,
    dirtyCount,
    saving,
    error,
    message,
    saveResult,

    selectCell,
    getCellValue,
    setCellValue,
    clearSelectedCell,
    addRowAfterSelected,
    markSelectedRowDeleted,
    undoSelectedRow,
    isCellDirty,
    isSourceChangedCell,
    isRowDeleted,
    isNewRow,
    saveChanges,
  } = useHistoryCurrentEdit({
    detail,
    columns,
    onSaved,
  });

  if (!detail) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">
        왼쪽 작업목록에서 작업을 선택하면 현재 통합관리 수정 화면이 표시됩니다.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">
        현재 통합관리 데이터를 준비하는 중입니다.
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">
        현재 수정할 행을 찾지 못했습니다.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-800">
              현재 통합관리 수정 화면
            </div>
            <div className="mt-1 text-xs text-slate-500">
              과거시점 화면을 참고해서 현재 데이터를 직접 수정합니다. 저장 시 현재값 재검사와 락 검사를 수행합니다.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
              행 {rows.length}건
            </span>

            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
              변경 {dirtyCount}건
            </span>

            <button
              type="button"
              onClick={clearSelectedCell}
              disabled={!selectedCell || saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              선택셀 비우기
            </button>

            <button
              type="button"
              onClick={markSelectedRowDeleted}
              disabled={!selectedCell || saving}
              className="rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              선택행 삭제
            </button>

            <button
              type="button"
              onClick={undoSelectedRow}
              disabled={!selectedCell || saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              선택행 되돌림
            </button>

            <button
              type="button"
              onClick={addRowAfterSelected}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              아래 행추가
            </button>

            <button
              type="button"
              onClick={() => void saveChanges()}
              disabled={dirtyCount === 0 || saving}
              className="rounded-md border border-blue-600 bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "저장중..." : "수정 저장"}
            </button>
          </div>
        </div>

        {(error || message || saveResult) && (
          <div className="mt-3 flex flex-col gap-1 text-xs">
            {error && <div className="text-red-600">{error}</div>}
            {message && <div className="text-slate-600">{message}</div>}
            {saveResult && (
              <div className="text-emerald-700">
                저장 결과: 수정 {saveResult.updatedCount}건 / 행추가 {saveResult.insertedCount}건 / 행삭제 {saveResult.deletedCount}건 / 제외 {saveResult.skippedCount}건
              </div>
            )}
          </div>
        )}
      </div>

      <div className="max-h-[420px] overflow-auto">
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
              const deleted = isRowDeleted(row.rowKey);
              const newRow = isNewRow(row.rowKey);

              return (
                <tr
                  key={row.rowKey}
                  className={`border-b border-slate-100 ${
                    deleted
                      ? "bg-rose-50 opacity-70"
                      : newRow
                        ? "bg-blue-50"
                        : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <td className="sticky left-0 z-10 border-r border-slate-200 bg-inherit px-2 py-2 font-semibold text-slate-700">
                    {newRow ? "추가" : row.row_number ?? "-"}
                  </td>

                  {columns.map((columnKey) => {
                    const cellKey = `${row.rowKey}::${columnKey}`;
                    const selected =
                      selectedCell?.rowKey === row.rowKey &&
                      selectedCell?.columnKey === columnKey;
                    const dirty = isCellDirty(row.rowKey, columnKey);
                    const sourceChanged = isSourceChangedCell(row.rowKey, columnKey);
                    const value = getCellValue(row.rowKey, columnKey);

                    return (
                      <td
                        key={cellKey}
                        className={`border-r border-slate-100 p-0 text-slate-700 ${
                          sourceChanged ? "bg-yellow-50" : ""
                        } ${dirty ? "bg-blue-50" : ""} ${
                          selected ? "outline outline-2 outline-blue-400 outline-offset-[-2px]" : ""
                        }`}
                        style={{
                          width: getColumnWidth(columnKey),
                          minWidth: getColumnWidth(columnKey),
                          maxWidth: getColumnWidth(columnKey),
                        }}
                        title={shortValue(value)}
                        onClick={() => selectCell(row.rowKey, columnKey)}
                      >
                        <input
                          value={value}
                          disabled={deleted || saving}
                          onChange={(e) =>
                            setCellValue(row.rowKey, columnKey, e.target.value)
                          }
                          className={`h-8 w-full bg-transparent px-2 text-xs outline-none ${
                            deleted ? "line-through text-slate-400" : "text-slate-700"
                          }`}
                        />
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
        노란색 셀은 선택한 작업에서 변경된 위치이고, 파란색 셀은 현재 화면에서 수정 준비된 값입니다.
      </div>
    </div>
  );
}