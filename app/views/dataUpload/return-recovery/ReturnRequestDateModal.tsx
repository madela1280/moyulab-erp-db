"use client";

import { useEffect, useState } from "react";

type ReturnRequestDateModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (dateText: string) => void;
};

export default function ReturnRequestDateModal({ open, onClose, onConfirm }: ReturnRequestDateModalProps) {
  const [dateText, setDateText] = useState("");

  useEffect(() => {
    if (!open) return;
    setDateText("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/20">
      <div className="w-[430px] rounded border border-slate-300 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <div className="text-sm font-semibold text-slate-800">날짜 입력</div>

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
          <div className="mb-3 text-sm text-slate-700">반납요청일을 입력하세요. 예: 2023-07-01</div>

          <input
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = dateText.trim();
                if (v) onConfirm(v);
              }
              if (e.key === "Escape") {
                onClose();
              }
            }}
            autoFocus
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            placeholder="예: 2023-07-01"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            취소
          </button>

          <button
            type="button"
            className="rounded border border-blue-700 bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={!dateText.trim()}
            onClick={() => {
              const v = dateText.trim();
              if (!v) return;
              onConfirm(v);
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}