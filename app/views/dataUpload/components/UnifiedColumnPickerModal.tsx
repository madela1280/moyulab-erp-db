"use client";

import { useEffect, useMemo, useState } from "react";

export default function UnifiedColumnPickerModal({
  open,
  onClose,
  allColumns,
  selectedKeys,
  onChangeSelectedKeys,
  onReloadColumns,
  loadingColumns,
}: {
  open: boolean;
  onClose: () => void;
  allColumns: string[];
  selectedKeys: string[];
  onChangeSelectedKeys: (next: string[]) => void;
  onReloadColumns: () => Promise<void> | void;
  loadingColumns: boolean;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allColumns;
    return allColumns.filter((c) => c.toLowerCase().includes(q));
  }, [allColumns, query]);

  if (!open) return null;

  function toggle(key: string) {
    if (selectedSet.has(key)) {
      onChangeSelectedKeys(selectedKeys.filter((k) => k !== key));
    } else {
      onChangeSelectedKeys([...selectedKeys, key]);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center" onMouseDown={onClose}>
      <div
        className="bg-white w-[760px] max-w-[95vw] rounded border shadow p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">양식(통합관리 컬럼 선택)</div>
          <button className="text-xs px-2 py-1 border rounded bg-slate-50" onClick={onClose} type="button">
            닫기
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            className="flex-1 border rounded px-2 py-1 text-sm"
            placeholder="컬럼 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-50"
            onClick={() => onChangeSelectedKeys(allColumns)}
            disabled={loadingColumns}
          >
            전체선택
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-50"
            onClick={() => onChangeSelectedKeys([])}
            disabled={loadingColumns}
          >
            전체해제
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-50"
            onClick={() => onReloadColumns()}
            disabled={loadingColumns}
          >
            {loadingColumns ? "새로고침..." : "새로고침"}
          </button>
        </div>

        <div className="mt-3 border rounded max-h-[420px] overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-slate-500">검색 결과가 없습니다.</div>
          ) : (
            <div className="divide-y">
              {filtered.map((c) => (
                <label key={c} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={selectedSet.has(c)} onChange={() => toggle(c)} />
                  <span className="text-slate-800">{c}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">선택: {selectedKeys.length}개</div>
          <button
            type="button"
            className="text-xs px-3 py-1 border rounded bg-slate-800 text-white"
            onClick={onClose}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}