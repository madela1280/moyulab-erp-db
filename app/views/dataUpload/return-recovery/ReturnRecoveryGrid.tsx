"use client";

import { useMemo } from "react";
import {
  RETURN_RECOVERY_COLUMNS,
  createEmptyReturnRecoveryRow,
  type ReturnRecoveryRow,
} from "@/views/dataUpload/return-recovery/columns";

type ReturnRecoveryGridProps = {
  rows?: ReturnRecoveryRow[];
};

export default function ReturnRecoveryGrid({ rows }: ReturnRecoveryGridProps) {
  const displayRows = useMemo(() => {
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return Array.from({ length: 10 }, (_, index) => createEmptyReturnRecoveryRow(index + 1));
  }, [rows]);

  return (
    <div className="flex-1 min-h-0 rounded border border-slate-300 bg-white overflow-auto">
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
                <div className="flex items-center justify-center gap-1">
                  <span>{col.label}</span>
                  <span className="text-[10px] text-slate-200">▼</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {displayRows.map((row) => (
            <tr key={row.id} className="h-8">
              {RETURN_RECOVERY_COLUMNS.map((col) => (
                <td
                  key={`${row.id}-${col.key}`}
                  className="border border-slate-300 px-2 py-1 align-middle whitespace-pre-wrap bg-white"
                  style={{
                    width: col.width,
                    minWidth: col.width,
                  }}
                >
                  {row.data?.[col.key] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}"use client";

import { useMemo } from "react";
import {
  RETURN_RECOVERY_COLUMNS,
  createEmptyReturnRecoveryRow,
  type ReturnRecoveryRow,
} from "@/views/dataUpload/return-recovery/columns";

type ReturnRecoveryGridProps = {
  rows?: ReturnRecoveryRow[];
};

export default function ReturnRecoveryGrid({ rows }: ReturnRecoveryGridProps) {
  const displayRows = useMemo(() => {
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return Array.from({ length: 10 }, (_, index) => createEmptyReturnRecoveryRow(index + 1));
  }, [rows]);

  return (
    <div className="flex-1 min-h-0 rounded border border-slate-300 bg-white overflow-auto">
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
                <div className="flex items-center justify-center gap-1">
                  <span>{col.label}</span>
                  <span className="text-[10px] text-slate-200">▼</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {displayRows.map((row) => (
            <tr key={row.id} className="h-8">
              {RETURN_RECOVERY_COLUMNS.map((col) => (
                <td
                  key={`${row.id}-${col.key}`}
                  className="border border-slate-300 px-2 py-1 align-middle whitespace-pre-wrap bg-white"
                  style={{
                    width: col.width,
                    minWidth: col.width,
                  }}
                >
                  {row.data?.[col.key] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}