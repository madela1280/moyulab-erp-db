"use client";

import { useMemo } from "react";

type Props = {
  open: boolean;
  anchor: { x: number; y: number } | null;
  columnKey: string | null;

  values: string[];

  selected: Set<string>;
  search: string;

  onClose: () => void;
  onSearchChange: (next: string) => void;
  onToggleValue: (value: string) => void;
  onSelectAll: () => void;
  onClear: () => void;

  onSortAsc: () => void;
  onSortDesc: () => void;
};

export default function ColumnFilterPopover({
  open,
  anchor,
  columnKey,
  values,
  selected,
  search,
  onClose,
  onSearchChange,
  onToggleValue,
  onSelectAll,
  onClear,
  onSortAsc,
  onSortDesc,
}: Props) {
  const filteredValues = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return values;
    return values.filter((v) => String(v).toLowerCase().includes(q));
  }, [values, search]);

  if (!open || !anchor || !columnKey) return null;

  return (
    <div
      className="fixed z-50 bg-white border shadow text-xs rounded"
      style={{ top: anchor.y, left: anchor.x, width: 260 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b font-semibold text-slate-700">{columnKey}</div>

      <div className="px-2 py-2 flex flex-col gap-1 border-b">
        <button className="text-left px-2 py-1 hover:bg-gray-100 rounded" onClick={onSortAsc}>
          텍스트 오름차순 정렬
        </button>
        <button className="text-left px-2 py-1 hover:bg-gray-100 rounded" onClick={onSortDesc}>
          텍스트 내림차순 정렬
        </button>
      </div>

      <div className="px-2 py-2 border-b">
        <input
          className="w-full h-8 text-xs px-2 border border-slate-200 rounded"
          placeholder="검색"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="px-2 py-2 flex items-center justify-between border-b">
        <button className="px-2 py-1 border rounded hover:bg-gray-100" onClick={onSelectAll}>
          모두선택
        </button>
        <button className="px-2 py-1 border rounded hover:bg-gray-100" onClick={onClear}>
          해제
        </button>
      </div>

      <div className="max-h-[280px] overflow-auto px-2 py-2">
        {filteredValues.map((v) => {
          const checked = selected.has(v);
          return (
            <label key={v} className="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded">
              <input type="checkbox" checked={checked} onChange={() => onToggleValue(v)} />
              <span className="truncate">{v === "" ? "(필드 값 없음)" : v}</span>
            </label>
          );
        })}
        {!filteredValues.length && <div className="text-center text-slate-500 py-6">검색 결과 없음</div>}
      </div>

      <div className="px-2 py-2 border-t flex justify-end gap-2">
        <button className="px-3 py-1 border rounded hover:bg-gray-100" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}