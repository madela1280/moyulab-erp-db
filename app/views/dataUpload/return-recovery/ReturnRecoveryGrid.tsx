"use client";

import { useMemo, useState, type ClipboardEvent } from "react";
import {
  RETURN_RECOVERY_COLUMNS,
  createEmptyReturnRecoveryRow,
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
  onRowsChange?: (rows: ReturnRecoveryRow[]) => void;
};

export default function ReturnRecoveryGrid({ rows, onRowsChange }: ReturnRecoveryGridProps) {
  const displayRows = useMemo(() => {
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return Array.from({ length: 10 }, (_, index) => createEmptyReturnRecoveryRow(index + 1));
  }, [rows]);

  const [selectionAnchor, setSelectionAnchor] = useState<ReturnRecoveryCellPoint | null>(null);
  const [selectedRange, setSelectedRange] = useState<ReturnRecoveryCellRange | null>(null);

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

  function handleCellMouseDown(rowIndex: number, colIndex: number) {
    const point = { rowIndex, colIndex };
    setSelectionAnchor(point);
    setSelectedRange(buildReturnRecoveryCellRange(point, point));
  }

  function handleCellMouseEnter(rowIndex: number, colIndex: number, buttons: number) {
    if (buttons !== 1 || !selectionAnchor) return;
    setSelectedRange(buildReturnRecoveryCellRange(selectionAnchor, { rowIndex, colIndex }));
  }

  function handleCopy(e: ClipboardEvent<HTMLDivElement>) {
    if (!selectedRange) return;

    const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
    const tagName = String(target?.tagName || "").toLowerCase();

    if (
      (tagName === "input" || tagName === "textarea") &&
      typeof target?.selectionStart === "number" &&
      typeof target?.selectionEnd === "number" &&
      target.selectionStart !== target.selectionEnd
    ) {
      return;
    }

    const tsv = makeReturnRecoveryTSV(displayRows, RETURN_RECOVERY_COLUMNS, selectedRange);
    if (!tsv) return;

    e.preventDefault();
    e.clipboardData.setData("text/plain", tsv);
  }

  return (
    <div className="flex-1 min-h-0 rounded border border-slate-300 bg-white overflow-auto" onCopy={handleCopy}>
      <table className="border-collapse text-xs text-slate-900">
        <thead className="sticky top-0 z-10">
          <tr>
            {RETURN_RECOVERY_COLUMNS.map((col, index) => (
              <th
                key={`${col.key}-${index}`}
                className="border border-slate-400 px-2 py-2 text-center font-semibold text-white whitespace-nowrap"
                style={{
                  width: col.width,
                  minWidth: col.width,
                  backgroundColor: index === 0 || index === RETURN_RECOVERY_COLUMNS.length - 1 ? "#ff0000" : "#7030a0",
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
              {RETURN_RECOVERY_COLUMNS.map((col, colIndex) => {
                const selected = isReturnRecoveryCellInRange(rowIndex, colIndex, selectedRange);

                return (
                  <td
                    key={`${row.id}-${col.key}`}
                    className={`border border-slate-300 align-middle bg-white ${
                      selected ? "outline outline-2 outline-blue-500 outline-offset-[-2px]" : ""
                    }`}
                    style={{
                      width: col.width,
                      minWidth: col.width,
                    }}
                    onMouseDown={() => handleCellMouseDown(rowIndex, colIndex)}
                    onMouseEnter={(e) => handleCellMouseEnter(rowIndex, colIndex, e.buttons)}
                  >
                    <input
                      value={row.data?.[col.key] ?? ""}
                      onChange={(e) => updateCell(rowIndex, col.key, e.target.value)}
                      onFocus={() => handleCellMouseDown(rowIndex, colIndex)}
                      className="block h-full min-h-8 w-full border-0 bg-transparent px-2 py-1 text-xs text-slate-900 outline-none"
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