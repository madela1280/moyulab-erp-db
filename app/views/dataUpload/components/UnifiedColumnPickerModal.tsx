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

  const allSet = useMemo(() => new Set(allColumns), [allColumns]);
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
      // 체크 순서 = 컬럼 배치 순서
      onChangeSelectedKeys([...selectedKeys, key]);
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= selectedKeys.length) return;
    const next = selectedKeys.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChangeSelectedKeys(next);
  }

  function removeAt(index: number) {
    const key = selectedKeys[index];
    onChangeSelectedKeys(selectedKeys.filter((k) => k !== key));
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center" onMouseDown={onClose}>
      <div
        className="bg-white w-[980px] max-w-[95vw] rounded border shadow p-4"
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
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
            onClick={() => onChangeSelectedKeys(allColumns)}
            disabled={loadingColumns}
          >
            전체선택
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
            onClick={() => onChangeSelectedKeys([])}
            disabled={loadingColumns}
          >
            전체해제
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
            onClick={() => onReloadColumns()}
            disabled={loadingColumns}
          >
            {loadingColumns ? "새로고침..." : "새로고침"}
          </button>
        </div>

        <div className="mt-3 flex gap-3">
          {/* Left: all columns */}
          <div className="flex-1 border rounded max-h-[480px] overflow-auto">
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

          {/* Right: selected order */}
          <div className="w-[340px] border rounded max-h-[480px] overflow-auto">
            <div className="px-3 py-2 border-b bg-slate-50">
              <div className="text-xs font-semibold text-slate-700">선택 순서(= 그리드 컬럼 순서)</div>
              <div className="text-[11px] text-slate-500 mt-1">필요하면 ↑/↓로 순서를 조정하세요.</div>
            </div>

            {selectedKeys.length === 0 ? (
              <div className="p-3 text-xs text-slate-500">선택된 컬럼이 없습니다.</div>
            ) : (
              <div className="divide-y">
                {selectedKeys.map((k, idx) => {
                  const exists = allSet.has(k);
                  return (
                    <div key={`${k}-${idx}`} className="px-3 py-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs ${exists ? "text-slate-800" : "text-red-600"}`}>
                          <span className="truncate block">{k}</span>
                        </div>
                        {!exists && (
                          <div className="text-[11px] text-red-600 mt-0.5">현재 컬럼 목록에 없음 — 제거 권장</div>
                        )}
                      </div>

                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-slate-50 disabled:opacity-40"
                        onClick={() => move(idx, idx - 1)}
                        disabled={idx === 0}
                        title="위로"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-slate-50 disabled:opacity-40"
                        onClick={() => move(idx, idx + 1)}
                        disabled={idx === selectedKeys.length - 1}
                        title="아래로"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 border rounded bg-white hover:bg-slate-50"
                        onClick={() => removeAt(idx)}
                        title="제거"
                      >
                        제거
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-slate-500">선택: {selectedKeys.length}개</div>
          <button
            type="button"
            className="text-xs px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
            onClick={onClose}
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}