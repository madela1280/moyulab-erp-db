"use client";

import { useMemo } from "react";
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
  onColumnWidthChange?: (key: string, width: number) => void;
};

function getMinWidth(key: string) {
  if (key === "checked") return 30;
  return 60;
}

function normalizeWidth(key: string, width: number) {
  const min = getMinWidth(key);
  return Math.max(min, Math.min(800, Math.round(width)));
}

function isEditableCell(mode: ReturnRequestViewMode, col: ReturnRequestColumn) {
  if (mode === "list") return false;
  return !!col.editable;
}

export default function ReturnRequestGrid({
  mode,
  rows,
  columns,
  isColumnWidthMode,
  onRowsChange,
  onColumnWidthChange,
}: ReturnRequestGridProps) {
  const displayRows = useMemo(() => {
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return Array.from({ length: 10 }, (_, index) => createEmptyReturnRequestRow(index + 1));
  }, [rows]);

 const displayColumns = useMemo(() => {
    return columns.map((col) => ({
      ...col,
      width: normalizeWidth(col.key, col.width),
    }));
  }, [columns]);

  function updateChecked(rowIndex: number, checked: boolean) {
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

 function handleColumnWidthChange(col: ReturnRequestColumn, value: string) {
    const nextWidth = normalizeWidth(col.key, Number(value));
    onColumnWidthChange?.(col.key, nextWidth);
  }

  return (
    <div className="flex-1 min-h-0 rounded border border-slate-300 bg-white overflow-auto">
      <table className="border-collapse text-xs text-slate-900 font-normal">
        <thead className="sticky top-0 z-10 bg-white">
          <tr>
            {displayColumns.map((col, index) => {
              const isWebColumn = RETURN_REQUEST_WEB_COLUMN_KEYS.has(col.key);

              return (
                <th
                  key={`${col.key}-${index}`}
                  className="select-none border border-slate-400 px-2 py-1 text-center font-semibold text-slate-900 whitespace-nowrap"
                  style={{
                    width: col.width,
                    minWidth: col.width,
                    backgroundColor: isWebColumn ? "#ffff00" : "#ffffff",
                  }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap">
                      {col.label}
                    </div>

                    {isColumnWidthMode && (
                      <input
                        className="h-6 w-16 rounded border border-slate-300 bg-white px-1 text-center text-[11px] text-slate-700"
                        type="number"
                        min={getMinWidth(col.key)}
                        max={800}
                        value={col.width}
                        onChange={(e) => handleColumnWidthChange(col, e.target.value)}
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

                if (col.key === "checked") {
                  return (
                    <td
                      key={`${row.id}-${col.key}`}
                      className="border border-slate-300 text-center align-middle bg-white"
                      style={{
                        width: col.width,
                        minWidth: col.width,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!row.checked}
                        onChange={(e) => updateChecked(rowIndex, e.target.checked)}
                        disabled={mode === "list"}
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
                    className="border border-slate-300 align-middle font-normal"
                    style={{
                      width: col.width,
                      minWidth: col.width,
                      backgroundColor: isWebColumn ? "#ffff00" : "#ffffff",
                    }}
                  >
                    {editable ? (
                      <input
                        value={value}
                        onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
                        className="block h-full min-h-8 w-full border-0 bg-transparent px-2 py-1 text-xs font-normal text-slate-900 outline-none"
                        style={{
                          width: col.width - 2,
                          minWidth: col.width - 2,
                        }}
                      />
                    ) : (
                      <div
                        className="min-h-8 px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis"
                        style={{
                          width: col.width - 2,
                          minWidth: col.width - 2,
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