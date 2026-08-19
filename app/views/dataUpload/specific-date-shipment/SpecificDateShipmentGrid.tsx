"use client";

import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from "react";
import {
  SPECIFIC_DATE_SHIPMENT_COLUMNS,
  createEmptySpecificDateShipmentRow,
  type SpecificDateShipmentColumn,
  type SpecificDateShipmentRow,
} from "@/views/dataUpload/specific-date-shipment/columns";
import {
  buildSpecificDateShipmentCellRange,
  isSpecificDateShipmentCellInRange,
  makeSpecificDateShipmentTSV,
  type SpecificDateShipmentCellPoint,
  type SpecificDateShipmentCellRange,
} from "@/views/dataUpload/specific-date-shipment/clipboard";

type SpecificDateShipmentGridProps = {
  rows?: SpecificDateShipmentRow[];
  columns?: SpecificDateShipmentColumn[];
  isColumnEditMode?: boolean;
  onRowsChange?: (rows: SpecificDateShipmentRow[]) => void;
  onColumnOrderChange?: (columnOrder: string[]) => void | Promise<void>;
  onColumnWidthChange?: (key: string, width: number) => void | Promise<void>;
};

// ✅ 정렬 삼각형 아이콘을 지원하는 컬럼(시작일/출고일자만)
const SORTABLE_COLUMN_KEYS = new Set(["startDate", "shipmentDate"]);

// ✅ 수기 입력 시 날짜 형식 자동변환 대상 컬럼(택배발송일)
const DATE_INPUT_COLUMN_KEYS = new Set(["shippingDate"]);

function isMultiCellRange(range: SpecificDateShipmentCellRange | null) {
  if (!range) return false;
  return range.startRow !== range.endRow || range.startCol !== range.endCol;
}

function normalizeWidth(width: number) {
  return Math.max(60, Math.min(800, Math.round(width)));
}

// ✅ 20260101 -> 2026-01-01, 2026.1.1 / 2026/1/1 -> 2026-01-01 로 정규화(이미 2026-01-01이면 그대로)
function normalizeDateInput(raw: string) {
  const s = String(raw ?? "").trim();
  if (!s) return s;

  if (/^\d{8}$/.test(s)) {
    return s.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  }

  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) {
    const y = m[1];
    const mo = String(m[2]).padStart(2, "0");
    const d = String(m[3]).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  return s;
}

export default function SpecificDateShipmentGrid({
  rows,
  columns,
  isColumnEditMode,
  onRowsChange,
  onColumnOrderChange,
  onColumnWidthChange,
}: SpecificDateShipmentGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);

  const displayRows = useMemo(() => {
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return Array.from({ length: 10 }, (_, index) => createEmptySpecificDateShipmentRow(index + 1));
  }, [rows]);

  const displayColumns = useMemo(() => {
    const baseColumns = Array.isArray(columns) && columns.length > 0 ? columns : SPECIFIC_DATE_SHIPMENT_COLUMNS;

    return baseColumns.map((col) => ({
      ...col,
      width: normalizeWidth(col.width),
    }));
  }, [columns]);

  // ✅ 날짜 정렬(시작일/출고일자 헤더의 오름차순/내림차순 토글)
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  // 화면에 실제로 그려지는(정렬 반영된) 행 순서. 데이터 수정은 항상 row.id 기준으로
  // displayRows(원본 순서)에 반영하므로, 정렬 중에도 편집이 엉키지 않는다.
  const sortedRows = useMemo(() => {
    if (!sortKey) return displayRows;

    const copy = [...displayRows];
    copy.sort((a, b) => {
      const av = a.data?.[sortKey] ?? "";
      const bv = b.data?.[sortKey] ?? "";
      if (av === bv) return 0;

      const cmp = av < bv ? -1 : 1;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return copy;
  }, [displayRows, sortKey, sortDir]);

  const [selectionAnchor, setSelectionAnchor] = useState<SpecificDateShipmentCellPoint | null>(null);
  const [selectedRange, setSelectedRange] = useState<SpecificDateShipmentCellRange | null>(null);

  function focusCell(rowIndex: number, colIndex: number) {
    window.setTimeout(() => {
      const input = gridRef.current?.querySelector<HTMLInputElement>(
        `input[data-sds-row="${rowIndex}"][data-sds-col="${colIndex}"]`
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
    setSelectedRange(buildSpecificDateShipmentCellRange(point, point));
  }

  function updateCellByRowId(rowId: string, colKey: string, value: string) {
    const nextRows = displayRows.map((row) => {
      if (row.id !== rowId) return row;

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

  function updateCell(rowIndex: number, colKey: string, value: string) {
    const row = sortedRows[rowIndex];
    if (!row) return;
    updateCellByRowId(row.id, colKey, value);
  }

  function commitDateCell(rowIndex: number, colKey: string, value: string) {
    if (!DATE_INPUT_COLUMN_KEYS.has(colKey)) return;

    const normalized = normalizeDateInput(value);
    if (normalized === value) return;

    updateCell(rowIndex, colKey, normalized);
  }

  function updateCheckedByRowId(rowId: string, checked: boolean) {
    const nextRows = displayRows.map((row) => (row.id === rowId ? { ...row, checked } : row));
    onRowsChange?.(nextRows);
  }

  function updateChecked(rowIndex: number, checked: boolean) {
    const row = sortedRows[rowIndex];
    if (!row) return;
    updateCheckedByRowId(row.id, checked);
  }

  function clearSelectedCells() {
    if (!selectedRange) return;

    const affectedIds = new Set<string>();
    for (let rowIndex = selectedRange.startRow; rowIndex <= selectedRange.endRow; rowIndex += 1) {
      const row = sortedRows[rowIndex];
      if (row) affectedIds.add(row.id);
    }

    const nextRows = displayRows.map((row) => {
      if (!affectedIds.has(row.id)) return row;

      const nextData = { ...(row.data ?? {}) };

      for (let colIndex = selectedRange.startCol; colIndex <= selectedRange.endCol; colIndex += 1) {
        const col = displayColumns[colIndex];
        if (col) nextData[col.key] = "";
      }

      return {
        ...row,
        data: nextData,
      };
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
    setSelectedRange(buildSpecificDateShipmentCellRange(selectionAnchor, { rowIndex, colIndex }));
  }

  function moveCell(rowIndex: number, colIndex: number, nextRowIndex: number, nextColIndex: number) {
    const safeRowIndex = Math.max(0, Math.min(sortedRows.length - 1, nextRowIndex));
    const safeColIndex = Math.max(0, Math.min(displayColumns.length - 1, nextColIndex));

    selectSingleCell(safeRowIndex, safeColIndex);
    focusCell(safeRowIndex, safeColIndex);
  }

  function moveColumn(colIndex: number, direction: -1 | 1) {
    const nextIndex = colIndex + direction;
    if (nextIndex < 0 || nextIndex >= displayColumns.length) return;

    const nextColumns = [...displayColumns];
    const current = nextColumns[colIndex];
    nextColumns[colIndex] = nextColumns[nextIndex];
    nextColumns[nextIndex] = current;

    onColumnOrderChange?.(nextColumns.map((col) => col.key));
  }

  function handleColumnWidthChange(col: SpecificDateShipmentColumn, value: string) {
    const nextWidth = normalizeWidth(Number(value));
    onColumnWidthChange?.(col.key, nextWidth);
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    if (e.key === "Delete" && selectedRange) {
      e.preventDefault();
      clearSelectedCells();
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Enter") {
      e.preventDefault();
      moveCell(rowIndex, colIndex, e.shiftKey ? rowIndex - 1 : rowIndex + 1, colIndex);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();

      if (e.shiftKey) {
        if (colIndex > 0) {
          moveCell(rowIndex, colIndex, rowIndex, colIndex - 1);
        } else {
          moveCell(rowIndex, colIndex, rowIndex - 1, displayColumns.length - 1);
        }
      } else if (colIndex < displayColumns.length - 1) {
        moveCell(rowIndex, colIndex, rowIndex, colIndex + 1);
      } else {
        moveCell(rowIndex, colIndex, rowIndex + 1, 0);
      }

      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      moveCell(rowIndex, colIndex, rowIndex - 1, colIndex);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveCell(rowIndex, colIndex, rowIndex + 1, colIndex);
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveCell(rowIndex, colIndex, rowIndex, colIndex - 1);
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      moveCell(rowIndex, colIndex, rowIndex, colIndex + 1);
    }
  }

  function handleCopy(e: ClipboardEvent<HTMLDivElement>) {
    if (!selectedRange) return;

    const tsv = makeSpecificDateShipmentTSV(sortedRows, displayColumns, selectedRange);
    if (!tsv) return;

    e.preventDefault();
    e.clipboardData.setData("text/plain", tsv);
  }

  return (
    <div
      ref={gridRef}
      className="flex-1 min-h-0 rounded border border-slate-300 bg-white overflow-auto"
      onCopy={handleCopy}
    >
      <table className="border-collapse text-xs text-slate-900 font-normal">
        <thead className="sticky top-0 z-10">
          <tr>
            {displayColumns.map((col, index) => (
              <th
                key={`${col.key}-${index}`}
                className="select-none border border-slate-400 px-2 py-2 text-center font-semibold text-white whitespace-nowrap"
                style={{
                  width: col.width,
                  minWidth: col.width,
                  backgroundColor: index === 0 || index === displayColumns.length - 1 ? "#ff0000" : "#7030a0",
                }}
              >
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1 w-full justify-center overflow-hidden text-ellipsis whitespace-nowrap">
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{col.label}</span>

                    {SORTABLE_COLUMN_KEYS.has(col.key) && (
                      <button
                        type="button"
                        className="text-[10px] leading-none text-white/80 hover:text-white"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleSort(col.key);
                        }}
                        title="날짜순 정렬"
                      >
                        {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
                      </button>
                    )}
                  </div>

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
                          title="왼쪽으로 이동"
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
                          title="오른쪽으로 이동"
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
                        title="열 넓이(px)"
                      />
                    </div>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sortedRows.map((row, rowIndex) => (
            <tr key={row.id} className="h-8">
              {displayColumns.map((col, colIndex) => {
                const selected = isSpecificDateShipmentCellInRange(rowIndex, colIndex, selectedRange);
                const multiSelected = selected && isMultiCellRange(selectedRange);

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
                      />
                    </td>
                  );
                }

                return (
                  <td
                    key={`${row.id}-${col.key}`}
                    className={`border border-slate-300 align-middle font-normal ${
                      multiSelected ? "bg-blue-50" : selected ? "bg-blue-100" : "bg-white"
                    }`}
                    style={{
                      width: col.width,
                      minWidth: col.width,
                    }}
                    onMouseDown={(e) => handleCellMouseDown(e, rowIndex, colIndex)}
                    onMouseEnter={(e) => handleCellMouseEnter(rowIndex, colIndex, e.buttons)}
                  >
                    <input
                      data-sds-row={rowIndex}
                      data-sds-col={colIndex}
                      value={row.data?.[col.key] ?? ""}
                      onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
                      onBlur={(e) => commitDateCell(rowIndex, col.key, e.target.value)}
                      onKeyDown={(e) => handleInputKeyDown(e, rowIndex, colIndex)}
                      className="block h-full min-h-8 w-full border-0 bg-transparent px-2 py-1 text-xs font-normal text-slate-900 outline-none"
                      style={{
                        width: col.width - 2,
                        minWidth: col.width - 2,
                      }}
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
