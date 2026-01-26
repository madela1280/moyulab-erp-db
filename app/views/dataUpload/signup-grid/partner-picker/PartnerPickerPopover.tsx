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

  // ✅ 삭제 모드: 켜면 리스트 항목 옆에 삭제 버튼 표시
  const [deleteMode, setDeleteMode] = useState(false);

  useEffect(() => setMounted(true), []);

  // 열릴 때 초기화 + 검색 입력 포커스
  useEffect(() => {
    if (!open) return;

    setQuery("");
    setBusy(false);
    setDeleteMode(false);

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

      // deleteMode일 때 Enter로 선택은 혼동될 수 있어 막는다.
      if (deleteMode) return;

      if (e.key === "Enter") {
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
  }, [open, onClose, deleteMode, query]);

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
    const W = 240; // 삭제 버튼 공간 고려로 조금 넓힘
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

  async function handleDeleteByName(name: string) {
    if (!onDelete) return;

    const n = normalizeName(name);
    if (!n) return;

    const ok = window.confirm(`거래처 "${n}" 를 삭제할까요?`);
    if (!ok) return;

    setBusy(true);
    try {
      await onDelete(n);
      // 삭제 후에도 계속 삭제 모드를 유지(여러 개 연속 삭제 가능)
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;
  if (!open) return null;

  const ui = (
    <div
      ref={popRef}
      className="fixed z-[9999] w-[240px] rounded border bg-white shadow-lg overflow-hidden"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => {
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
              if (deleteMode) return;
              if (filtered[0]) {
                onSelect(filtered[0]);
                onClose();
              }
            }}
            disabled={busy || deleteMode || filtered.length === 0}
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
              <div
                key={name}
                className={[
                  "w-full border-b last:border-b-0",
                  isSelected ? "bg-blue-50" : "bg-white",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <button
                    type="button"
                    className={[
                      "flex-1 text-left text-xs",
                      isSelected ? "text-slate-800" : "text-slate-700",
                      "hover:bg-slate-100 rounded px-1 py-1",
                    ].join(" ")}
                    onClick={() => {
                      if (deleteMode) return;
                      onSelect(name);
                      onClose();
                    }}
                    disabled={busy || deleteMode}
                    title={name}
                  >
                    <span className="block truncate">{name}</span>
                  </button>

                  {deleteMode && (
                    <button
                      type="button"
                      className="shrink-0 h-7 px-2 text-[11px] border rounded bg-white hover:bg-red-50 text-red-600 disabled:opacity-60"
                      onClick={() => {
                        void handleDeleteByName(name);
                      }}
                      disabled={busy || !onDelete}
                      title="삭제"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 하단 버튼 */}
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
            className={[
              "w-full h-8 text-xs border rounded disabled:opacity-60",
              deleteMode ? "bg-red-50 border-red-200 text-red-700" : "bg-white hover:bg-slate-50",
            ].join(" ")}
            onClick={() => {
              if (!onDelete) return;
              setDeleteMode((v) => !v);
            }}
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