"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function sortKorean(a: string, b: string) {
  return String(a).localeCompare(String(b), "ko");
}

export default function PartnerPickerPopover({
  open,
  x,
  y,
  options,
  value,
  onSelect,
  onClose,
  onAdd,
  onDelete,
}: {
  open: boolean;
  x: number;
  y: number;
  options: string[];
  value: string;
  onSelect: (name: string) => void;
  onClose: () => void;
  onAdd?: (name: string) => void | Promise<void>;
  onDelete?: (name: string) => void | Promise<void>;
}) {
  const popRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  // 열릴 때 초기화 + 검색 입력 포커스
  useEffect(() => {
    if (!open) return;

    setQuery("");
    setBusy(false);

    const t = window.setTimeout(() => {
      try {
        searchRef.current?.focus();
      } catch {
        // ignore
      }
    }, 0);

    return () => window.clearTimeout(t);
  }, [open]);

  // 바깥 클릭/ESC 닫기 + Enter로 첫 결과 선택
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const el = popRef.current;
      const t = e.target as Node | null;
      if (!el || !t) return;
      if (el.contains(t)) return;
      onClose();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();

      if (e.key === "Enter") {
        // 검색창 Enter → 첫 결과 선택(엑셀 필터 느낌)
        const first = filtered[0];
        if (first) {
          e.preventDefault();
          onSelect(first);
          onClose();
        }
      }
    };

    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);

    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, query]);

  const normalizedOptions = useMemo(() => {
    const base = Array.isArray(options) ? options.map(normalizeName).filter(Boolean) : [];
    const cur = normalizeName(value);
    const merged = cur ? Array.from(new Set([cur, ...base])) : Array.from(new Set(base));
    merged.sort(sortKorean);
    return merged;
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = normalizeName(query).toLowerCase();
    if (!q) return normalizedOptions;
    return normalizedOptions.filter((o) => o.toLowerCase().includes(q));
  }, [normalizedOptions, query]);

  // 뷰포트 밖으로 나가면 보정
  const pos = useMemo(() => {
    if (typeof window === "undefined") return { left: x, top: y };

    const PAD = 8;
    const W = 220;
    const H = 330;

    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;

    let left = x;
    let top = y;

    if (left + W + PAD > vw) left = Math.max(PAD, vw - W - PAD);
    if (top + H + PAD > vh) top = Math.max(PAD, vh - H - PAD);

    return { left, top };
  }, [x, y]);

  async function handleAddPrompt() {
    if (!onAdd) return;

    const name = window.prompt("신규 거래처를 입력해 주세요.");
    const n = normalizeName(name);
    if (!n) return;

    setBusy(true);
    try {
      await onAdd(n);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePrompt() {
    if (!onDelete) return;

    const name = window.prompt("삭제할 거래처명을 입력해 주세요.");
    const n = normalizeName(name);
    if (!n) return;

    const ok = window.confirm(`거래처 "${n}" 를 삭제할까요?`);
    if (!ok) return;

    setBusy(true);
    try {
      await onDelete(n);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;
  if (!open) return null;

  const ui = (
    <div
      ref={popRef}
      className="fixed z-[9999] w-[220px] rounded border bg-white shadow-lg overflow-hidden"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => {
        // 바깥 클릭 닫기 로직과 충돌 방지
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* 검색 */}
      <div className="p-2 border-b bg-slate-50">
        <div className="flex gap-2">
          <input
            ref={searchRef}
            className="flex-1 h-8 px-2 text-xs border rounded outline-none"
            placeholder="여기에 입력"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            className="h-8 px-2 text-xs border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
            onClick={() => {
              if (filtered[0]) {
                onSelect(filtered[0]);
                onClose();
              }
            }}
            disabled={busy || filtered.length === 0}
          >
            확인
          </button>
        </div>
      </div>

      {/* 목록(스크롤) */}
      <div className="max-h-[220px] overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-3 text-xs text-slate-400">검색 결과가 없습니다.</div>
        ) : (
          filtered.map((name) => {
            const isSelected = normalizeName(value) === name;
            return (
              <button
                key={name}
                type="button"
                className={[
                  "w-full text-left px-3 py-2 text-xs border-b last:border-b-0",
                  isSelected ? "bg-blue-50 text-slate-800" : "bg-white text-slate-700 hover:bg-slate-100",
                ].join(" ")}
                onClick={() => {
                  onSelect(name);
                  onClose();
                }}
                disabled={busy}
              >
                {name}
              </button>
            );
          })
        )}
      </div>

      {/* 하단 버튼(요구사항: prompt 입력 방식) */}
      <div className="p-2 border-t bg-white">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full h-8 text-xs border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
            onClick={handleAddPrompt}
            disabled={busy || !onAdd}
          >
            신규거래처 추가
          </button>

          <button
            type="button"
            className="w-full h-8 text-xs border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
            onClick={handleDeletePrompt}
            disabled={busy || !onDelete}
          >
            기존거래처 삭제
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}