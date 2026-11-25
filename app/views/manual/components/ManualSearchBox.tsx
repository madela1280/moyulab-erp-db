"use client";

// app/views/manual/components/ManualSearchBox.tsx
//
// 제목/본문/키워드 검색. 결과 클릭 시 해당 노드로 이동한다.

import { useEffect, useRef, useState } from "react";
import { searchManuals, type ManualSearchResult } from "../service/manualApi";
import type { ManualSelection } from "./ManualTree";

type Props = {
  onSelect: (sel: ManualSelection) => void;
};

export default function ManualSearchBox({ onSelect }: Props) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<ManualSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = keyword.trim();
    if (!trimmed) {
      setResults([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      const r = await searchManuals(trimmed);
      setResults(r);
      setOpen(true);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [keyword]);

  return (
    <div className="relative">
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="검색"
        className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded shadow-lg z-10 max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">검색 결과 없음</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onSelect({ category: r.category, subcategory: r.subcategory, detail: r.detail });
                  setOpen(false);
                  setKeyword("");
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
              >
                <div className="font-medium text-slate-800">{r.title}</div>
                <div className="text-xs text-slate-400">
                  {[r.category, r.subcategory, r.detail].filter(Boolean).join(" > ")}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{r.snippet}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
