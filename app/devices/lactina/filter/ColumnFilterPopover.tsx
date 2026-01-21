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

  onSearchChange: (q: string) => void;
  onToggleValue: (v: string) => void;

  onSelectAll: () => void;
  onClear: () => void;

  onSortAsc: () => void;
  onSortDesc: () => void;
};

function toText(v: any) {
  return String(v ?? "");
}

export default function ColumnFilterPopover(props: Props) {
  const {
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
  } = props;

  const filteredValues = useMemo(() => {
    const q = toText(search).trim().toLowerCase();
    if (!q) return values;
    return values.filter((v) => toText(v).toLowerCase().includes(q));
  }, [values, search]);

  if (!open || !anchor || !columnKey) return null;

  return (
    <div
      className="fixed z-50 bg-white border shadow text-xs rounded"
      style={{ top: anchor.y, left: anchor.x, width: 260 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b font-semibold text-slate-700">
        필터: <span className="font-normal">{columnKey}</span>
      </div>

      <div className="p-2 border-b">
        <input
          className="w-full border rounded px-2 py-1 text-xs"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="검색"
        />
      </div>

      <div className="p-2 border-b flex items-center justify-between gap-2">
        <button className="px-2 py-1 border rounded hover:bg-gray-100" onClick={onSelectAll} type="button">
          전체선택
        </button>
        <button className="px-2 py-1 border rounded hover:bg-gray-100" onClick={onClear} type="button">
          해제
        </button>
        <div className="flex-1" />
        <button className="px-2 py-1 border rounded hover:bg-gray-100" onClick={onSortAsc} type="button">
          ▲
        </button>
        <button className="px-2 py-1 border rounded hover:bg-gray-100" onClick={onSortDesc} type="button">
          ▼
        </button>
      </div>

      <div className="max-h-[320px] overflow-auto p-2">
        {filteredValues.map((v) => {
          const checked = selected.has(v);
          return (
            <label key={v} className="flex items-center gap-2 py-1 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleValue(v)}
              />
              <span className="truncate">{v || "(빈값)"}</span>
            </label>
          );
        })}
        {!filteredValues.length && <div className="text-slate-500 px-1 py-2">결과 없음</div>}
      </div>

      <div className="px-2 py-2 border-t flex justify-end">
        <button className="px-3 py-1 border rounded hover:bg-gray-100" onClick={onClose} type="button">
          닫기
        </button>
      </div>
    </div>
  );
}