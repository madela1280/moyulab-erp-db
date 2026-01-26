"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function sortKorean(a: string, b: string) {
  // ko 기준 정렬(환경에 따라 다를 수 있어도 기본 localeCompare로 충분)
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
  const [hovered, setHovered] = useState<string>("");
  const [pickedForDelete, setPickedForDelete] = useState<string>("");

  const [addMode, setAddMode] = useState(false);
  const [addText, setAddText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  // 열릴 때 초기화 + 검색 입력 포커스
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHovered("");
    setPickedForDelete(normalizeName(value));
    setAddMode(false);
    setAddText("");
    setBusy(false);

    const t = window.setTimeout(() => {
      try {
        searchRef.current?.focus();
      } catch {
        // ignore
      }
    }, 0);

    return () => window.clearTimeout(t);
  }, [open, value]);

  // 바깥 클릭 / ESC 닫기
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

      // Enter: 검색 결과 1개면 바로 선택
      if (e.key === "Enter") {
        if (addMode) return;
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
  }, [open, onClose, addMode]);

  const normalizedOptions = useMemo(() => {
    const base = Array.isArray(options) ? options.map(normalizeName).filter(Boolean) : [];
    // 현재 값이 옵션에 없으면 임시로라도 목록에 포함(선택 유지)
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
    const H = 320;

    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;

    let left = x;
    let top = y;

    if (left + W + PAD > vw) left = Math.max(PAD, vw - W - PAD);
    if (top + H + PAD > vh) top = Math.max(PAD, vh - H - PAD);

    return { left, top };
  }, [x, y]);

  async function handleAddSave() {
    const n = normalizeName(addText);
    if (!n) return;

    if (!onAdd) return;

    setBusy(true);
    try {
      await onAdd(n);
      onSelect(n);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const n = normalizeName(pickedForDelete || hovered || value);
    if (!n) return;
    if (!onDelete) return;

    const ok = window.confirm(`거래처 "${n}" 를 삭제할까요?`);
    if (!ok) return;

    setBusy(true);
    try {
      await onDelete(n);
      // 삭제한 값이 현재 선택값이면 셀 값 비우기
      if (normalizeName(value) === n) {
        onSelect("");
      }
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
        // 외부 mousedown 로직과 충돌 방지
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
            disabled={busy || filtered.length === 0 || addMode}
          >
            확인
          </button>
        </div>
      </div>

      {/* 목록 */}
      <div className="max-h-[220px] overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-3 text-xs text-slate-400">검색 결과가 없습니다.</div>
        ) : (
          filtered.map((name) => {
            const isSelected = normalizeName(value) === name;
            const isDeletePick = normalizeName(pickedForDelete) === name;

            return (
              <button
                key={name}
                type="button"
                className={[
                  "w-full text-left px-3 py-2 text-xs border-b last:border-b-0",
                  isSelected ? "bg-blue-50 text-slate-800" : "bg-white text-slate-700",
                  isDeletePick ? "ring-1 ring-red-300 ring-inset" : "",
                  "hover:bg-slate-100",
                ].join(" ")}
                onMouseEnter={() => setHovered(name)}
                onFocus={() => setHovered(name)}
                onClick={() => {
                  onSelect(name);
                  onClose();
                }}
                disabled={busy || addMode}
              >
                {name}
              </button>
            );
          })
        )}
      </div>

      {/* 하단 액션 */}
      <div className="p-2 border-t bg-white">
        {!addMode ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="w-full h-8 text-xs border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
              onClick={() => {
                setAddMode(true);
                setAddText("");
                setTimeout(() => {
                  try {
                    searchRef.current?.focus();
                  } catch {}
                }, 0);
              }}
              disabled={busy || !onAdd}
            >
              신규거래처 추가
            </button>

            <button
              type="button"
              className="w-full h-8 text-xs border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
              onClick={handleDelete}
              disabled={busy || !onDelete}
            >
              기존거래처 삭제
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              className="w-full h-8 px-2 text-xs border rounded outline-none"
              placeholder="새 거래처 입력"
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              disabled={busy}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 h-8 text-xs border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                onClick={handleAddSave}
                disabled={busy || !normalizeName(addText) || !onAdd}
              >
                저장
              </button>
              <button
                type="button"
                className="flex-1 h-8 text-xs border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
                onClick={() => {
                  setAddMode(false);
                  setAddText("");
                }}
                disabled={busy}
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}