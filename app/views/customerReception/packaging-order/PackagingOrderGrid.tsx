"use client";

// app/views/customerReception/packaging-order/PackagingOrderGrid.tsx
//
// 포장재구매 그리드. dataUpload/return-recovery/ReturnRecoveryGrid.tsx와 같은 동작
// (열 이동/너비 조절, 영역지정 복사(Ctrl+C), 영역지정 삭제(Delete))을 제공하되
// 반납회수 코드는 건드리지 않기 위해 이 기능 전용 파일로 분리했다.
//
// 맨 앞 "확인" 체크박스 컬럼은 열 이동/너비 대상이 아닌 고정 컬럼이라
// PACKAGING_ORDER_COLUMNS 목록과 별도로 그린다.
// "입금확인" 컬럼은 값 입력이 아니라 상태 표시 + 정렬 트리거(헤더의 ▲/▼) 역할만 한다.

import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from "react";
import {
  PACKAGING_ORDER_COLUMNS,
  createEmptyPackagingOrderRow,
  getCellDisplayValue,
  getPaymentStatusLabel,
  type PackagingOrderColumn,
  type PackagingOrderRow,
} from "@/views/customerReception/packaging-order/columns";
import {
  buildPackagingOrderCellRange,
  isPackagingOrderCellInRange,
  makePackagingOrderTSV,
  type PackagingOrderCellPoint,
  type PackagingOrderCellRange,
} from "@/views/customerReception/packaging-order/clipboard";

export type PackagingOrderSortMode = "none" | "confirmed-first" | "waiting-first";

type PackagingOrderGridProps = {
  rows?: PackagingOrderRow[];
  columns?: PackagingOrderColumn[];
  isColumnEditMode?: boolean;
  onRowsChange?: (rows: PackagingOrderRow[]) => void;
  onColumnsChange?: (columns: PackagingOrderColumn[]) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: (checked: boolean) => void;
  sortMode?: PackagingOrderSortMode;
  onToggleSort?: () => void;
};

function isMultiCellRange(range: PackagingOrderCellRange | null) {
  if (!range) return false;
  return range.startRow !== range.endRow || range.startCol !== range.endCol;
}

function normalizeWidth(width: number) {
  return Math.max(60, Math.min(800, Math.round(width)));
}

/** status/datetime/checknote는 값 입력이 아니라 서버 데이터를 그대로 보여주기만 하는 읽기전용 컬럼 */
function isReadonlyColumn(col: PackagingOrderColumn) {
  return col.type === "status" || col.type === "datetime" || col.type === "checknote";
}

export default function PackagingOrderGrid({
  rows,
  columns,
  isColumnEditMode,
  onRowsChange,
  onColumnsChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  sortMode = "none",
  onToggleSort,
}: PackagingOrderGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);

  const displayRows = useMemo(() => {
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return Array.from({ length: 10 }, (_, index) => createEmptyPackagingOrderRow(index + 1));
  }, [rows]);

  const displayColumns = useMemo(() => {
    const baseColumns = Array.isArray(columns) && columns.length > 0 ? columns : PACKAGING_ORDER_COLUMNS;
    return baseColumns.map((col) => ({ ...col, width: normalizeWidth(col.width) }));
  }, [columns]);

  const [selectionAnchor, setSelectionAnchor] = useState<PackagingOrderCellPoint | null>(null);
  const [selectedRange, setSelectedRange] = useState<PackagingOrderCellRange | null>(null);

  const allChecked = displayRows.length > 0 && displayRows.every((row) => selectedIds?.has(row.id));

  function focusCell(rowIndex: number, colIndex: number) {
    window.setTimeout(() => {
      const input = gridRef.current?.querySelector<HTMLInputElement>(
        `input[data-po-row="${rowIndex}"][data-po-col="${colIndex}"]`
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
    setSelectedRange(buildPackagingOrderCellRange(point, point));
  }

  function updateCell(rowIndex: number, colKey: string, value: string) {
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
        if (col && !isReadonlyColumn(col)) nextData[col.key] = "";
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
    setSelectedRange(buildPackagingOrderCellRange(selectionAnchor, { rowIndex, colIndex }));
  }

  function moveCell(rowIndex: number, colIndex: number, nextRowIndex: number, nextColIndex: number) {
    const safeRowIndex = Math.max(0, Math.min(displayRows.length - 1, nextRowIndex));
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

    onColumnsChange?.(nextColumns);
  }

  function handleColumnWidthChange(col: PackagingOrderColumn, value: string) {
    const nextWidth = normalizeWidth(Number(value));
    onColumnsChange?.(displayColumns.map((c) => (c.key === col.key ? { ...c, width: nextWidth } : c)));
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
        if (colIndex > 0) moveCell(rowIndex, colIndex, rowIndex, colIndex - 1);
        else moveCell(rowIndex, colIndex, rowIndex - 1, displayColumns.length - 1);
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
    const tsv = makePackagingOrderTSV(displayRows, displayColumns, selectedRange);
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
            <th
              className="select-none border border-slate-400 px-2 py-2 text-center font-semibold text-white"
              style={{ width: 40, minWidth: 40, backgroundColor: "#7030a0" }}
            >
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => onToggleSelectAll?.(e.target.checked)}
                title="전체 선택"
              />
            </th>

            {displayColumns.map((col, index) => (
              <th
                key={`${col.key}-${index}`}
                className="select-none border border-slate-400 px-2 py-2 text-center font-semibold text-white whitespace-nowrap"
                style={{ width: col.width, minWidth: col.width, backgroundColor: "#7030a0" }}
              >
                <div className="flex flex-col items-center gap-1">
                  <div className="w-full overflow-hidden text-ellipsis whitespace-nowrap flex items-center justify-center gap-1">
                    <span>{col.label}</span>
                    {col.type === "status" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleSort?.();
                        }}
                        className="leading-none text-[10px] hover:text-purple-200"
                        title="입금확인 상태로 정렬"
                      >
                        {sortMode === "waiting-first" ? "▲" : "▼"}
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
          {displayRows.map((row, rowIndex) => (
            <tr key={row.id} className="h-8">
              <td
                className="border border-slate-300 bg-white text-center align-middle"
                style={{ width: 40, minWidth: 40 }}
              >
                <input
                  type="checkbox"
                  checked={!!selectedIds?.has(row.id)}
                  onChange={() => onToggleSelect?.(row.id)}
                />
              </td>

              {displayColumns.map((col, colIndex) => {
                const selected = isPackagingOrderCellInRange(rowIndex, colIndex, selectedRange);
                const multiSelected = selected && isMultiCellRange(selectedRange);

                if (col.type === "status") {
                  const label = getPaymentStatusLabel(row.status);
                  const badgeClass =
                    label === "입금확정"
                      ? "bg-blue-100 text-blue-700"
                      : label === "확인필요"
                      ? "bg-red-100 text-red-700"
                      : "bg-slate-100 text-slate-500";
                  return (
                    <td
                      key={`${row.id}-${col.key}`}
                      className={`border border-slate-300 align-middle text-center font-normal ${
                        multiSelected ? "bg-blue-50" : selected ? "bg-blue-100" : "bg-white"
                      }`}
                      style={{ width: col.width, minWidth: col.width }}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, colIndex)}
                      onMouseEnter={(e) => handleCellMouseEnter(rowIndex, colIndex, e.buttons)}
                    >
                      <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
                        {label}
                      </span>
                    </td>
                  );
                }

                if (col.type === "datetime" || col.type === "checknote") {
                  const text = getCellDisplayValue(row, col);
                  return (
                    <td
                      key={`${row.id}-${col.key}`}
                      className={`border border-slate-300 align-middle text-center font-normal ${
                        multiSelected ? "bg-blue-50" : selected ? "bg-blue-100" : "bg-white"
                      } ${col.type === "checknote" && text ? "text-red-600 font-semibold" : "text-slate-600"}`}
                      style={{ width: col.width, minWidth: col.width }}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, colIndex)}
                      onMouseEnter={(e) => handleCellMouseEnter(rowIndex, colIndex, e.buttons)}
                    >
                      <span className="block truncate px-2 py-1 text-xs">{text}</span>
                    </td>
                  );
                }

                return (
                  <td
                    key={`${row.id}-${col.key}`}
                    className={`border border-slate-300 align-middle font-normal ${
                      multiSelected ? "bg-blue-50" : selected ? "bg-blue-100" : "bg-white"
                    }`}
                    style={{ width: col.width, minWidth: col.width }}
                    onMouseDown={(e) => handleCellMouseDown(e, rowIndex, colIndex)}
                    onMouseEnter={(e) => handleCellMouseEnter(rowIndex, colIndex, e.buttons)}
                  >
                    <input
                      data-po-row={rowIndex}
                      data-po-col={colIndex}
                      value={row.data?.[col.key] ?? ""}
                      onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
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
