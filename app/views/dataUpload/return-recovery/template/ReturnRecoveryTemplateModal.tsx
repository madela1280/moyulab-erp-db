"use client";

import { useEffect, useState } from "react";
import type { ReturnRecoveryColumn } from "@/views/dataUpload/return-recovery/columns";

type ReturnRecoveryTemplateModalProps = {
  open: boolean;
  customColumns: ReturnRecoveryColumn[];
  loading?: boolean;
  saving?: boolean;
  error?: string;
  onClose: () => void;
  onAdd: (label: string) => void;
  onDelete: (key: string) => void;
};

export default function ReturnRecoveryTemplateModal({
  open,
  customColumns,
  loading,
  saving,
  error,
  onClose,
  onAdd,
  onDelete,
}: ReturnRecoveryTemplateModalProps) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel("");
  }, [open]);

  if (!open) return null;

  function handleAdd() {
    const nextLabel = label.trim();
    if (!nextLabel) return;

    onAdd(nextLabel);
    setLabel("");
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/20">
      <div className="w-[460px] rounded border border-slate-300 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <div className="text-sm font-semibold text-slate-800">양식추가</div>

          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-4">
          <div className="mb-2 text-xs text-slate-500">반납회수 전용 추가 컬럼을 생성/삭제합니다.</div>

          <div className="flex items-center gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") onClose();
              }}
              className="h-9 flex-1 rounded border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="추가할 컬럼명"
              autoFocus
            />

            <button
              type="button"
              className="h-9 rounded border border-blue-700 bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={!label.trim() || saving}
              onClick={handleAdd}
            >
              추가
            </button>
          </div>

          {error && <div className="mt-2 text-xs text-red-600">{error}</div>}

          <div className="mt-4 max-h-[360px] overflow-auto rounded border border-slate-200">
            {loading ? (
              <div className="px-3 py-3 text-sm text-slate-500">불러오는 중...</div>
            ) : customColumns.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-500">추가된 컬럼이 없습니다.</div>
            ) : (
              <div className="divide-y divide-slate-200">
                {customColumns.map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-slate-800">{col.label}</div>
                      <div className="truncate text-[11px] text-slate-400">{col.key}</div>
                    </div>

                    <button
                      type="button"
                      className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      disabled={saving}
                      onClick={() => onDelete(col.key)}
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={saving}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}