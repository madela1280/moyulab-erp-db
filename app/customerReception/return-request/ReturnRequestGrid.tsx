"use client";

import { useMemo, useRef, useState } from "react";
import type {
  ReturnRequestColumn,
  ReturnRequestRow,
  ReturnRequestViewMode,
} from "@/customerReception/return-request/types";
import {
  createEmptyReturnRequestRow,
  RETURN_REQUEST_WEB_COLUMN_KEYS,
} from "@/customerReception/return-request/columns";

type ReturnRequestGridProps = {
  mode: ReturnRequestViewMode;
  rows?: ReturnRequestRow[];
  columns: ReturnRequestColumn[];
  isColumnWidthMode?: boolean;
  onRowsChange?: (rows: ReturnRequestRow[]) => void;
  onCellCommit?: (row: ReturnRequestRow, colKey: string, value: string) => void;
  onColumnWidthChange?: (key: string, width: number) => void;
};

function getMinWidth(key: string) {
  if (key === "checked") return 30;
  return 60;
}

function normalizeWidth(key: string, width: number) {
  const min = getMinWidth(key);
  const n = Number(width);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(800, Math.round(n)));
}

function getDisplayWidth(col: ReturnRequestColumn) {
  return normalizeWidth(col.key, col.width);
}

function isEmptyRow(row: ReturnRequestRow) {
  return String(row?.id || "").startsWith("empty-");
}

function isEditableCell(mode: ReturnRequestViewMode, col: ReturnRequestColumn) {
  if (mode === "list") return false;

  // 노란색 웹접수 컬럼만 수정 가능
  if (!RETURN_REQUEST_WEB_COLUMN_KEYS.has(col.key)) return false;

  return !!col.editable;
}

export default function ReturnRequestGrid({
  mode,
  rows,
  columns,
  isColumnWidthMode,
  onRowsChange,
  onCellCommit,
  onColumnWidthChange,
}: ReturnRequestGridProps) {
  const displayRows = useMemo(() => {
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return Array.from({ length: 10 }, (_, index) => createEmptyReturnRequestRow(index + 1));
  }, [rows]);

  const displayColumns = useMemo(() => {
    return columns.map((col) => ({
      ...col,
      width: getDisplayWidth(col),
    }));
  }, [columns]);

    const [draftWidths, setDraftWidths] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function getCellRefKey(rowIndex: number, colKey: string) {
    return `${rowIndex}__${colKey}`;
  }

  function focusEditableCell(rowIndex: number, colKey: string) {
    const key = getCellRefKey(rowIndex, colKey);

    setTimeout(() => {
      const el = inputRefs.current[key];
      if (!el) return;

      el.focus();
      el.select();
    }, 0);
  }

  function findNextEditableColumnIndex(currentColIndex: number, direction: -1 | 1) {
    let nextIndex = currentColIndex + direction;

    while (nextIndex >= 0 && nextIndex < displayColumns.length) {
      const nextCol = displayColumns[nextIndex];

      if (nextCol && isEditableCell(mode, nextCol)) {
        return nextIndex;
      }

      nextIndex += direction;
    }

    return currentColIndex;
  }

  function updateChecked(rowIndex: number, checked: boolean) {
    const targetRow = displayRows[rowIndex];
    if (!targetRow || isEmptyRow(targetRow)) return;

    const nextRows = displayRows.map((row, index) => {
      if (index !== rowIndex) return row;

      return {
        ...row,
        checked,
      };
    });

    onRowsChange?.(nextRows);
  }

  function updateCell(rowIndex: number, colKey: string, value: string) {
    const targetRow = displayRows[rowIndex];
    if (!targetRow || isEmptyRow(targetRow)) return;

    const nextRows = displayRows.map((row, index) => {
      if (index !== rowIndex) return row;

      return {
        ...row,
        data: {
          ...(row.data ?? {}),
          [colKey]: value,
        },
      };
    });

    onRowsChange?.(nextRows);
  }

   function commitCell(rowIndex: number, colKey: string, value: string) {
    if (mode === "list") return;
    if (!RETURN_REQUEST_WEB_COLUMN_KEYS.has(colKey)) return;

    const row = displayRows[rowIndex];
    if (!row || isEmptyRow(row)) return;

    const commitRow: ReturnRequestRow = {
      ...row,
      data: {
        ...(row.data ?? {}),
        [colKey]: value,
      },
    };

    onCellCommit?.(commitRow, colKey, value);
  }

  function getDraftWidthValue(col: ReturnRequestColumn) {
    return Object.prototype.hasOwnProperty.call(draftWidths, col.key)
      ? draftWidths[col.key]
      : String(col.width);
  }

  function handleWidthDraftChange(col: ReturnRequestColumn, value: string) {
    setDraftWidths((prev) => ({
      ...prev,
      [col.key]: value,
    }));
  }

  function commitColumnWidth(col: ReturnRequestColumn) {
    const raw = getDraftWidthValue(col);
    const nextWidth = normalizeWidth(col.key, Number(raw));

    setDraftWidths((prev) => {
      const next = { ...prev };
      delete next[col.key];
      return next;
    });

    onColumnWidthChange?.(col.key, nextWidth);
  }

  return (
    <div className="flex-1 min-h-0 rounded border border-slate-300 bg-white overflow-auto">
      <table className="table-fixed border-collapse text-xs text-slate-900 font-normal">
        <thead className="sticky top-0 z-10 bg-white">
          <tr>
            {displayColumns.map((col, index) => {
              const isWebColumn = RETURN_REQUEST_WEB_COLUMN_KEYS.has(col.key);
              const widthInputWidth = col.key === "checked" ? 38 : 64;

              return (
                <th
                  key={`${col.key}-${index}`}
                  className="select-none border border-slate-400 px-0 py-1 text-center font-semibold text-slate-900 whitespace-nowrap"
                  style={{
                    width: col.width,
                    minWidth: col.width,
                    maxWidth: col.width,
                    backgroundColor: isWebColumn ? "#ffff00" : "#ffffff",
                  }}
                >
                  <div className="flex flex-col items-center gap-1 px-1">
                    <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap">
                      {col.label}
                    </div>

                    {isColumnWidthMode && (
                      <input
                        className="h-6 rounded border border-slate-300 bg-white px-1 text-center text-[11px] text-slate-700"
                        style={{
                          width: widthInputWidth,
                        }}
                        type="number"
                        min={getMinWidth(col.key)}
                        max={800}
                        value={getDraftWidthValue(col)}
                        onChange={(e) => handleWidthDraftChange(col, e.target.value)}
                        onBlur={() => commitColumnWidth(col)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                        title="열 넓이(px)"
                      />
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {displayRows.map((row, rowIndex) => (
            <tr key={row.id} className="h-8">
              {displayColumns.map((col) => {
                const isWebColumn = RETURN_REQUEST_WEB_COLUMN_KEYS.has(col.key);
                const editable = isEditableCell(mode, col);
                const emptyRow = isEmptyRow(row);

                if (col.key === "checked") {
                  return (
                    <td
                      key={`${row.id}-${col.key}`}
                      className="border border-slate-300 text-center align-middle bg-white px-0"
                      style={{
                        width: col.width,
                        minWidth: col.width,
                        maxWidth: col.width,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!row.checked}
                        onChange={(e) => updateChecked(rowIndex, e.target.checked)}
                        disabled={mode === "list" || emptyRow}
                      />
                    </td>
                  );
                }

                const value =
                  col.key === "processStatus"
                    ? row.processStatus
                    : col.key === "receivedAt"
                      ? row.receivedAt
                      : row.data?.[col.key] ?? "";

                return (
                  <td
                    key={`${row.id}-${col.key}`}
                    className="border border-slate-300 align-middle font-normal px-0"
                    style={{
                      width: col.width,
                      minWidth: col.width,
                      maxWidth: col.width,
                      backgroundColor: isWebColumn ? "#ffff00" : "#ffffff",
                    }}
                  >
                    {editable && !emptyRow ? (
                                           <input
                        ref={(el) => {
                          inputRefs.current[getCellRefKey(rowIndex, col.key)] = el;
                        }}
                        value={value}
                        onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
                        onBlur={(e) => commitCell(rowIndex, col.key, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                            return;
                          }

                          if (
                            e.key !== "ArrowUp" &&
                            e.key !== "ArrowDown" &&
                            e.key !== "ArrowLeft" &&
                            e.key !== "ArrowRight"
                          ) {
                            return;
                          }

                          e.preventDefault();

                          const currentValue = e.currentTarget.value;
                          commitCell(rowIndex, col.key, currentValue);

                          const currentColIndex = displayColumns.findIndex(
                            (targetCol) => targetCol.key === col.key
                          );

                          let nextRowIndex = rowIndex;
                          let nextColIndex = currentColIndex;

                          if (e.key === "ArrowUp") {
                            nextRowIndex = Math.max(0, rowIndex - 1);
                          }

                          if (e.key === "ArrowDown") {
                            nextRowIndex = Math.min(displayRows.length - 1, rowIndex + 1);
                          }

                          if (e.key === "ArrowLeft") {
                            nextColIndex = findNextEditableColumnIndex(currentColIndex, -1);
                          }

                          if (e.key === "ArrowRight") {
                            nextColIndex = findNextEditableColumnIndex(currentColIndex, 1);
                          }

                          const nextRow = displayRows[nextRowIndex];
                          const nextCol = displayColumns[nextColIndex];

                          if (!nextRow || !nextCol || isEmptyRow(nextRow)) {
                            return;
                          }

                          if (!isEditableCell(mode, nextCol)) {
                            return;
                          }

                          focusEditableCell(nextRowIndex, nextCol.key);
                        }}
                        className="block h-full min-h-8 w-full border-0 bg-transparent px-1 py-1 text-xs font-normal text-slate-900 outline-none"
                        style={{
                          width: col.width,
                          minWidth: col.width,
                          maxWidth: col.width,
                        }}
                      /> 
                    ) : (
                      <div
                        className="min-h-8 px-1 py-1 whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{
                          width: col.width,
                          minWidth: col.width,
                          maxWidth: col.width,
                        }}
                        title={value}
                      >
                        {value}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}