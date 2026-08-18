"use client";

import { useEffect, useMemo, useState } from "react";
import type { SpecificDateShipmentColumn } from "@/views/dataUpload/specific-date-shipment/columns";

type InsertPosition = "after" | "before";

type SpecificDateShipmentTemplateModalProps = {
  open: boolean;
  columns: SpecificDateShipmentColumn[];
  customColumns: SpecificDateShipmentColumn[];
  loading?: boolean;
  saving?: boolean;
  onClose: () => void;
  onAdd: (label: string, referenceKey: string, position: InsertPosition) => void;
  onDelete: (key: string) => void;
  onReload?: () => void;
};

export default function SpecificDateShipmentTemplateModal({
  open,
  columns,
  customColumns,
  loading,
  saving,
  onClose,
  onAdd,
  onDelete,
  onReload,
}: SpecificDateShipmentTemplateModalProps) {
  const safeColumns = useMemo(() => (Array.isArray(columns) ? columns : []), [columns]);
  const safeCustomColumns = useMemo(() => (Array.isArray(customColumns) ? customColumns : []), [customColumns]);

  const [label, setLabel] = useState("");
  const [referenceKey, setReferenceKey] = useState("");
  const [position, setPosition] = useState<InsertPosition>("after");

  useEffect(() => {
    if (!open) return;

    setLabel("");
    setReferenceKey(safeColumns[0]?.key ?? "");
    setPosition("after");
  }, [open, safeColumns]);

  if (!open) return null;

  function handleAdd() {
    const nextLabel = label.trim();
    const nextReferenceKey = String(referenceKey || "").trim();

    if (!nextLabel) {
      alert("양식(컬럼) 이름을 입력해 주세요.");
      return;
    }

    if (!nextReferenceKey) {
      alert("기준 컬럼을 선택해 주세요.");
      return;
    }

    onAdd(nextLabel, nextReferenceKey, position);
    setLabel("");
  }

  function handleDelete(key: string, name: string) {
    if (!confirm(`양식(컬럼) "${name}" 을 삭제할까요?`)) return;
    onDelete(key);
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[920px] max-w-[95vw] rounded border border-slate-300 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="text-sm font-semibold text-slate-800">양식추가(새 컬럼 추가) / 양식삭제</div>

          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4">
          <div className="rounded border border-slate-200 p-3">
            <div className="mb-3 text-sm font-semibold text-slate-700">추가</div>

            <div className="mb-1 text-xs text-slate-600">양식(컬럼) 이름</div>
            <input
              className="mb-3 h-9 w-full rounded border border-slate-300 px-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="예: 재방문일 / 메모3 ..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") onClose();
              }}
              autoFocus
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-xs text-slate-600">기준 컬럼</div>
                <select
                  className="h-9 w-full rounded border border-slate-300 px-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={referenceKey}
                  onChange={(e) => setReferenceKey(e.target.value)}
                >
                  {safeColumns.map((col) => (
                    <option key={col.key} value={col.key}>
                      {col.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-xs text-slate-600">삽입 위치</div>
                <select
                  className="h-9 w-full rounded border border-slate-300 px-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={position}
                  onChange={(e) => setPosition(e.target.value === "before" ? "before" : "after")}
                >
                  <option value="after">뒤(기준 컬럼 뒤)</option>
                  <option value="before">앞(기준 컬럼 앞)</option>
                </select>
              </div>
            </div>

            <div className="mt-3 text-[11px] text-slate-500">
              주의: 양식(컬럼)은 특정일자출고 화면 공통 구조에 추가됩니다.
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={saving}
                onClick={onClose}
              >
                취소
              </button>

              <button
                type="button"
                className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-40"
                disabled={saving || !label.trim() || !referenceKey}
                onClick={handleAdd}
              >
                추가
              </button>
            </div>
          </div>

          <div className="rounded border border-slate-200 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">삭제(커스텀 양식 목록)</div>

              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                disabled={loading || saving}
                onClick={onReload}
              >
                새로고침
              </button>
            </div>

            {loading ? (
              <div className="rounded border border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                불러오는 중...
              </div>
            ) : safeCustomColumns.length === 0 ? (
              <div className="rounded border border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                추가된 양식(커스텀 컬럼)이 없습니다.
              </div>
            ) : (
              <div className="max-h-[360px] overflow-auto rounded border border-slate-200">
                {safeCustomColumns.map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 last:border-b-0">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-slate-800">{col.label}</div>
                      <div className="truncate text-[11px] text-slate-400">{col.key}</div>
                    </div>

                    <button
                      type="button"
                      className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      disabled={saving}
                      onClick={() => handleDelete(col.key, col.label)}
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 text-[11px] text-slate-500">
              삭제는 표시 컬럼을 제거합니다. 기본 컬럼 14개는 삭제되지 않습니다.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
