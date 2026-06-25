"use client";

import { useEffect, useMemo, useRef } from "react";

type Props = {
  open: boolean;
  anchor?: { x: number; y: number } | null;
  keyword: string;
  loading?: boolean;
  currentIndex: number;
  total: number;
  returnedCount: number;
  truncated?: boolean;
  error?: string;
  onKeywordChange: (value: string) => void;
  onSearch: () => void | Promise<void>;
  onNext: () => void;
  onClose: () => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function UnifiedSearchPanel({
  open,
  anchor,
  keyword,
  loading = false,
  currentIndex,
  total,
  returnedCount,
  truncated = false,
  error = "",
  onKeywordChange,
  onSearch,
  onNext,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const hasResults = returnedCount > 0;
  const currentLabel = hasResults ? currentIndex + 1 : 0;
  const isNextDisabled = loading || !hasResults || currentIndex >= returnedCount - 1;

  const positionStyle = useMemo(() => {
    const panelWidth = 360;
    const panelHeight = 142;
    const margin = 12;

    const rawLeft = anchor?.x ?? 140;
    const rawTop = anchor?.y ?? 88;

    if (typeof window === "undefined") {
      return { left: rawLeft, top: rawTop };
    }

    const maxLeft = Math.max(margin, window.innerWidth - panelWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - panelHeight - margin);

    return {
      left: clamp(rawLeft, margin, maxLeft),
      top: clamp(rawTop, margin, maxTop),
    };
  }, [anchor]);

  useEffect(() => {
    if (!open) return;

    const t = window.setTimeout(() => {
      try {
        inputRef.current?.focus();
        inputRef.current?.select();
      } catch {
        // ignore
      }
    }, 0);

    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      data-unified-search-panel="1"
      className="fixed z-[80] w-[360px] rounded-md border border-slate-300 bg-white shadow-lg"
      style={positionStyle}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <form
        className="flex flex-col gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSearch();
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold text-slate-700">통합관리 검색</div>
          <button
            type="button"
            className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            placeholder="검색어 입력"
            className="h-8 flex-1 rounded border border-slate-300 px-2 text-[12px] outline-none focus:border-slate-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="h-8 rounded border border-slate-300 bg-slate-100 px-3 text-[12px] text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            검색
          </button>

          <button
            type="button"
            disabled={isNextDisabled}
            className="h-8 rounded border border-slate-300 bg-slate-100 px-3 text-[12px] text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onNext}
          >
            다음
          </button>
        </div>

        <div className="min-h-[18px] text-[11px] text-slate-600">
          {loading ? (
            <span>검색 중...</span>
          ) : error ? (
            <span className="text-rose-600">{error}</span>
          ) : hasResults ? (
            <span>
              {currentLabel} / {returnedCount}
              {truncated ? ` (전체 ${total}건 중 ${returnedCount}건만 표시)` : ` (총 ${total}건)`}
            </span>
          ) : keyword ? (
            <span>검색 결과 없음</span>
          ) : (
            <span>기기번호 ~ 반납완료일 범위에서 검색</span>
          )}
        </div>
      </form>
    </div>
  );
}