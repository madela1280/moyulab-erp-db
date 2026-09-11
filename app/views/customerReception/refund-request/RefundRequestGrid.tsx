"use client";

// app/views/customerReception/refund-request/RefundRequestGrid.tsx
//
// 환불접수 그리드. 다른 고객접수 그리드(포장재구매/연장연체료)와 같은 조작(열 이동/너비, 영역지정
// 복사, Delete 비우기)을 제공하되, "입금" 컬럼만 자유입력이 아니라 드롭다운(반품전/입금전/입금완료)
// 이고, 셀을 벗어날 때(blur)/드롭다운 선택 시 바로 서버에 저장한다(onFieldSave).

import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from "react";
import {
  REFUND_REQUEST_COLUMNS,
  PAYMENT_STATUS_OPTIONS,
  createEmptyRefundRequestRow,
  getCellDisplayValue,
  type RefundRequestColumn,
  type RefundRequestRow,
} from "@/views/customerReception/refund-request/columns";
import {
  buildRefundRequestCellRange,
  isRefundRequestCellInRange,
  makeRefundRequestTSV,
  type RefundRequestCellPoint,
  type RefundRequestCellRange,
} from "@/views/customerReception/refund-request/clipboard";

type RefundRequestGridProps = {
  rows?: RefundRequestRow[];
  columns?: RefundRequestColumn[];
  isColumnEditMode?: boolean;
  onRowsChange?: (rows: RefundRequestRow[]) => void;
  onColumnsChange?: (columns: RefundRequestColumn[]) => void;
  onFieldSave?: (rowId: string, field: string, value: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: (checked: boolean) => void;
};

function isMultiCellRange(range: RefundRequestCellRange | null) {
  if (!range) return false;
  return range.startRow !== range.endRow || range.startCol !== range.endCol;
}

function normalizeWidth(width: number) {
  return Math.max(60, Math.min(800, Math.round(width)));
}

function isReadonlyColumn(col: RefundRequestColumn) {
  return col.type === "datetime";
}

export default function RefundRequestGrid({
  rows,
  columns,
  isColumnEditMode,
  onRowsChange,
  onColumnsChange,
  onFieldSave,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: RefundRequestGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);

  const displayRows = useMemo(() => {
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return Array.from({ length: 10 }, (_, index) => createEmptyRefundRequestRow(index + 1));
  }, [rows]);

  const displayColumns = useMemo(() => {
    const baseColumns = Array.isArray(columns) && columns.length > 0 ? columns : REFUND_REQUEST_COLUMNS;
    return baseColumns.map((col) => ({ ...col, width: normalizeWidth(col.width) }));
  }, [columns]);

  const [selectionAnchor, setSelectionAnchor] = useState<RefundRequestCellPoint | null>(null);
  const [selectedRange, setSelectedRange] = useState<RefundRequestCellRange | null>(null);

  const allChecked = displayRows.length > 0 && displayRows.every((row) => selectedIds?.has(row.id));

  function focusCell(rowIndex: number, colIndex: number) {
    window.setTimeout(() => {
      const input = gridRef.current?.querySelector<HTMLInputElement>(
        `input[data-rr-row="${rowIndex}"][data-rr-col="${colIndex}"]`
      );
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }, 0);
  }

  function selectSingleCell(rowIndex: number, colIndex: number) {
    const point = { rowIndex, colIndex };
    setSelectionAnchor(point);
    setSelectedRange(buildRefundRequestCellRange(point, point));
  }

  function updateCellLocal(rowIndex: number, colKey: string, value: string) {
    const nextRows = displayRows.map((row, index) => {
      if (index !== rowIndex) return row;
      return { ...row, data: { ...(row.data ?? {}), [colKey]: value } };
    });
    onRowsChange?.(nextRows);
  }

  function clearSelectedCells() {
    if (!selectedRange) return;
    const nextRows = displayRows.map((row, rowIndex) => {
      if (rowIndex < selectedRange.startRow || rowIndex > selectedRange.endRow) return row;
      const nextData = { ...(row.data ?? {}) };
      for (let colIndex = selectedRange.startCol; colIndex <= selectedRange.endCol; colIndex += 1) {
        const col = displayColumns[colIndex];
        if (col && !isReadonlyColumn(col)) {
          nextData[col.key] = "";
          onFieldSave?.(row.id, col.key, "");
        }
      }
      return { ...row, data: nextData };
    });
    onRowsChange?.(nextRows);
  }

  function handleCellMouseDown(e: MouseEvent<HTMLTableCellElement>, rowIndex: number, colIndex: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    selectSingleCell(rowIndex, colIndex);
    focusCell(rowIndex, colIndex);
  }

  function handleCellMouseEnter(rowIndex: number, colIndex: number, buttons: number) {
    if (buttons !== 1 || !selectionAnchor) return;
    setSelectedRange(buildRefundRequestCellRange(selectionAnchor, { rowIndex, colIndex }));
  }

  function moveColumn(colIndex: number, direction: -1 | 1) {
    const nextIndex = colIndex + direction;
    if (nextIndex < 0 || nextIndex >= displayColumns.length) return;
    const nextColumns = [...displayColumns];
    const current = nextColumns[colIndex];
    nextColumns[colIndex] = nextColumns[nextIndex];
    nextColumns[nextIndex] = current;
    onColumnsChange?.(nextColumns);
  }

  function handleColumnWidthChange(col: RefundRequestColumn, value: string) {
    const nextWidth = normalizeWidth(Number(value));
    onColumnsChange?.(displayColumns.map((c) => (c.key === col.key ? { ...c, width: nextWidth } : c)));
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    if (e.key === "Delete" && selectedRange) {
      e.preventDefault();
      clearSelectedCells();
    }
  }

  function handleCopy(e: ClipboardEvent<HTMLDivElement>) {
    if (!selectedRange) return;
    const tsv = makeRefundRequestTSV(displayRows, displayColumns, selectedRange);
    if (!tsv) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", tsv);
  }

  return (
    <div ref={gridRef} className="flex-1 min-h-0 rounded border border-slate-300 bg-white overflow-auto" onCopy={handleCopy}>
      <table className="border-collapse text-xs text-slate-900 font-normal">
        <thead className="sticky top-0 z-10">
          <tr>
            <th
              className="select-none border border-slate-400 px-2 py-2 text-center font-semibold text-white"
              style={{ width: 40, minWidth: 40, backgroundColor: "#7030a0" }}
            >
              <input type="checkbox" checked={allChecked} onChange={(e) => onToggleSelectAll?.(e.target.checked)} title="전체 선택" />
            </th>

            {displayColumns.map((col, index) => (
              <th
                key={`${col.key}-${index}`}
                className="select-none border border-slate-400 px-2 py-2 text-center font-semibold text-white whitespace-nowrap"
                style={{ width: col.width, minWidth: col.width, backgroundColor: "#7030a0" }}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap">{col.label}</span>
                  {isColumnEditMode && (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-600 disabled:opacity-30"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            moveColumn(index, -1);
                          }}
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-600 disabled:opacity-30"
                          disabled={index === displayColumns.length - 1}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            moveColumn(index, 1);
                          }}
                        >
                          →
                        </button>
                      </div>
                      <input
                        className="h-6 w-14 rounded border border-slate-200 bg-white px-1 text-center text-[11px] text-slate-700"
                        type="number"
                        min={60}
                        max={800}
                        value={col.width}
                        onChange={(e) => handleColumnWidthChange(col, e.target.value)}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {displayRows.map((row, rowIndex) => (
            <tr key={row.id} className="h-8">
              <td className="border border-slate-300 bg-white text-center align-middle" style={{ width: 40, minWidth: 40 }}>
                <input type="checkbox" checked={!!selectedIds?.has(row.id)} onChange={() => onToggleSelect?.(row.id)} />
              </td>

              {displayColumns.map((col, colIndex) => {
                const selected = isRefundRequestCellInRange(rowIndex, colIndex, selectedRange);
                const multiSelected = selected && isMultiCellRange(selectedRange);
                const cellBg = multiSelected ? "bg-blue-50" : selected ? "bg-blue-100" : "bg-white";

                if (col.type === "datetime") {
                  const text = getCellDisplayValue(row, col);
                  return (
                    <td
                      key={`${row.id}-${col.key}`}
                      className={`border border-slate-300 align-middle text-center font-normal text-slate-600 ${cellBg}`}
                      style={{ width: col.width, minWidth: col.width }}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, colIndex)}
                      onMouseEnter={(e) => handleCellMouseEnter(rowIndex, colIndex, e.buttons)}
                    >
                      <span className="block truncate px-2 py-1 text-xs">{text}</span>
                    </td>
                  );
                }

                if (col.type === "select") {
                  const value = row.data?.[col.key] || PAYMENT_STATUS_OPTIONS[0];
                  const badgeClass =
                    value === "입금완료"
                      ? "text-blue-700"
                      : value === "입금전"
                      ? "text-red-600 font-semibold"
                      : "text-slate-500";
                  return (
                    <td
                      key={`${row.id}-${col.key}`}
                      className={`border border-slate-300 align-middle text-center font-normal ${cellBg}`}
                      style={{ width: col.width, minWidth: col.width }}
                    >
                      <select
                        className={`h-full w-full border-0 bg-transparent px-1 py-1 text-xs outline-none ${badgeClass}`}
                        value={value}
                        onChange={(e) => {
                          updateCellLocal(rowIndex, col.key, e.target.value);
                          onFieldSave?.(row.id, col.key, e.target.value);
                        }}
                      >
                        {PAYMENT_STATUS_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                }

                return (
                  <td
                    key={`${row.id}-${col.key}`}
                    className={`border border-slate-300 align-middle font-normal ${cellBg}`}
                    style={{ width: col.width, minWidth: col.width }}
                    onMouseDown={(e) => handleCellMouseDown(e, rowIndex, colIndex)}
                    onMouseEnter={(e) => handleCellMouseEnter(rowIndex, colIndex, e.buttons)}
                  >
                    <input
                      data-rr-row={rowIndex}
                      data-rr-col={colIndex}
                      value={row.data?.[col.key] ?? ""}
                      onChange={(e) => updateCellLocal(rowIndex, col.key, e.target.value)}
                      onBlur={(e) => onFieldSave?.(row.id, col.key, e.target.value)}
                      onKeyDown={(e) => handleInputKeyDown(e, rowIndex, colIndex)}
                      className="block h-full min-h-8 w-full border-0 bg-transparent px-2 py-1 text-xs font-normal text-slate-900 outline-none"
                      style={{ width: col.width - 2, minWidth: col.width - 2 }}
                    />
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
