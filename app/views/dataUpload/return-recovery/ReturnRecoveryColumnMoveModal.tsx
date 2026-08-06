"use client";

import { useEffect, useState } from "react";
import type { ReturnRecoveryColumn } from "@/views/dataUpload/return-recovery/columns";

type ReturnRecoveryColumnMoveModalProps = {
  open: boolean;
  columns: ReturnRecoveryColumn[];
  saving?: boolean;
  onClose: () => void;
  onSave: (columnOrder: string[]) => void;
};

export default function ReturnRecoveryColumnMoveModal({
  open,
  columns,
  saving,
  onClose,
  onSave,
}: ReturnRecoveryColumnMoveModalProps) {
  const [localColumns, setLocalColumns] = useState<ReturnRecoveryColumn[]>([]);

  useEffect(() => {
    if (!open) return;
    setLocalColumns(Array.isArray(columns) ? columns : []);
  }, [open, columns]);

  if (!open) return null;

  function moveColumn(index: number, direction: -1 | 1) {
    setLocalColumns((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;

      const next = [...prev];
      const current = next[index];
      next[index] = next[nextIndex];
      next[nextIndex] = current;

      return next;
    });
  }

  function handleSave() {
    onSave(localColumns.map((col) => col.key));
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/20">
      <div className="w-[420px] rounded border border-slate-300 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <div className="text-sm font-semibold text-slate-800">열이동</div>

          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="max-h-[520px] overflow-auto px-4 py-3">
          <div className="mb-2 text-xs text-slate-500">위/아래 버튼으로 컬럼 순서를 변경합니다.</div>

          <div className="space-y-1">
            {localColumns.map((col, index) => (
              <div
                key={col.key}
                className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0 text-sm text-slate-800">
                  <span className="mr-2 text-xs text-slate-400">{index + 1}</span>
                  <span className="truncate">{col.label}</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    disabled={index === 0 || saving}
                    onClick={() => moveColumn(index, -1)}
                  >
                    위
                  </button>

                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    disabled={index === localColumns.length - 1 || saving}
                    onClick={() => moveColumn(index, 1)}
                  >
                    아래
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={saving}
            onClick={onClose}
          >
            취소
          </button>

          <button
            type="button"
            className="rounded border border-blue-700 bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}