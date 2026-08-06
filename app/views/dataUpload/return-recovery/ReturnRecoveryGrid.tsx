"use client";

import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from "react";
import {
  RETURN_RECOVERY_COLUMNS,
  createEmptyReturnRecoveryRow,
  type ReturnRecoveryColumn,
  type ReturnRecoveryRow,
} from "@/views/dataUpload/return-recovery/columns";
import {
  buildReturnRecoveryCellRange,
  isReturnRecoveryCellInRange,
  makeReturnRecoveryTSV,
  type ReturnRecoveryCellPoint,
  type ReturnRecoveryCellRange,
} from "@/views/dataUpload/return-recovery/clipboard";

type ReturnRecoveryGridProps = {
  rows?: ReturnRecoveryRow[];
  columns?: ReturnRecoveryColumn[];
  onRowsChange?: (rows: ReturnRecoveryRow[]) => void;
};

function isMultiCellRange(range: ReturnRecoveryCellRange | null) {
  if (!range) return false;
  return range.startRow !== range.endRow || range.startCol !== range.endCol;
}

export default function ReturnRecoveryGrid({ rows, columns, onRowsChange }: ReturnRecoveryGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);

  const displayRows = useMemo(() => {
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return Array.from({ length: 10 }, (_, index) => createEmptyReturnRecoveryRow(index + 1));
  }, [rows]);

  const displayColumns = useMemo(() => {
    if (Array.isArray(columns) && columns.length > 0) return columns;
    return RETURN_RECOVERY_COLUMNS;
  }, [columns]);

  const [selectionAnchor, setSelectionAnchor] = useState<ReturnRecoveryCellPoint | null>(null);
  const [selectedRange, setSelectedRange] = useState<ReturnRecoveryCellRange | null>(null);

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
    setSelectedRange(buildReturnRecoveryCellRange(point, point));
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

  function clearSelectedCells() {
    if (!selectedRange) return;

    const nextRows = displayRows.map((row, rowIndex) => {
      if (rowIndex < selectedRange.startRow || rowIndex > selectedRange.endRow) return row;

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
    setSelectedRange(buildReturnRecoveryCellRange(selectionAnchor, { rowIndex, colIndex }));
  }

   function moveCell(rowIndex: number, colIndex: number, nextRowIndex: number, nextColIndex: number) {
    const safeRowIndex = Math.max(0, Math.min(displayRows.length - 1, nextRowIndex));
    const safeColIndex = Math.max(0, Math.min(displayColumns.length - 1, nextColIndex));

    selectSingleCell(safeRowIndex, safeColIndex);
    focusCell(safeRowIndex, safeColIndex);
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

    const tsv = makeReturnRecoveryTSV(displayRows, displayColumns, selectedRange);
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
                className="border border-slate-400 px-2 py-2 text-center font-semibold text-white whitespace-nowrap"
                style={{
                  width: col.width,
                  minWidth: col.width,
                  backgroundColor: index === 0 || index === displayColumns.length - 1 ? "#ff0000" : "#7030a0",
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {displayRows.map((row, rowIndex) => (
            <tr key={row.id} className="h-8">
              {displayColumns.map((col, colIndex) => {
                const selected = isReturnRecoveryCellInRange(rowIndex, colIndex, selectedRange);
                const multiSelected = selected && isMultiCellRange(selectedRange);

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
                      data-rr-row={rowIndex}
                      data-rr-col={colIndex}
                      value={row.data?.[col.key] ?? ""}
                      onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
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