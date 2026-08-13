"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function sortKorean(a: string, b: string) {
  return String(a).localeCompare(String(b), "ko");
}

export default function UnifiedDeviceStatusPickerPopover({
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
  onSelect: (name: string) => void | Promise<void>;
  onClose: () => void;
  onAdd?: (name: string) => void | Promise<void>;
  onDelete?: (name: string) => void | Promise<void>;
}) {
  const popRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);

  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const draggingRef = useRef<{
    active: boolean;
    offsetX: number;
    offsetY: number;
  }>({ active: false, offsetX: 0, offsetY: 0 });

  useEffect(() => setMounted(true), []);

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

  function computeInitialPos(clientX: number, clientY: number) {
    const PAD = 8;
    const W = 240;
    const H = 330;

    const vw = (typeof window !== "undefined" ? window.innerWidth : 0) || 0;
    const vh = (typeof window !== "undefined" ? window.innerHeight : 0) || 0;

    let left = clientX;
    let top = clientY;

    if (vw > 0 && left + W + PAD > vw) left = Math.max(PAD, vw - W - PAD);
    if (vh > 0 && top + H + PAD > vh) top = Math.max(PAD, vh - H - PAD);

    return { left, top };
  }

  useEffect(() => {
    if (!open) return;

    setQuery("");
    setBusy(false);
    setDeleteMode(false);

    const p = computeInitialPos(x, y);
    setPos(p);

    const t = window.setTimeout(() => {
      try {
        searchRef.current?.focus();
      } catch {
        // ignore
      }
    }, 0);

    return () => window.clearTimeout(t);
  }, [open, x, y]);

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

      if (deleteMode) return;

      if (e.key === "Enter") {
        const first = filtered[0];
        if (first) {
          e.preventDefault();
          void handleSelect(first);
        }
      }
    };

    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);

    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, deleteMode, filtered]);

  useEffect(() => {
    if (!open) return;

    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current.active) return;

      const PAD = 8;
      const W = 240;
      const H = 330;

      const vw = window.innerWidth || 0;
      const vh = window.innerHeight || 0;

      let left = e.clientX - draggingRef.current.offsetX;
      let top = e.clientY - draggingRef.current.offsetY;

      if (vw > 0) left = Math.max(PAD, Math.min(left, vw - W - PAD));
      if (vh > 0) top = Math.max(PAD, Math.min(top, vh - H - PAD));

      setPos({ left, top });
    };

    const onUp = () => {
      draggingRef.current.active = false;
    };

    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);

    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };
  }, [open]);

  async function handleSelect(name: string) {
    if (busy) return;

    const n = normalizeName(name);
    if (!n) return;

    setBusy(true);
    try {
      await onSelect(n);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleAddPrompt() {
    if (!onAdd) return;

    const name = window.prompt("신규 기기상태를 입력해 주세요.");
    const n = normalizeName(name);
    if (!n) return;

    setBusy(true);
    try {
      await onAdd(n);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteByName(name: string) {
    if (!onDelete) return;

    const n = normalizeName(name);
    if (!n) return;

    const ok = window.confirm(`기기상태 "${n}" 를 삭제할까요?`);
    if (!ok) return;

    setBusy(true);
    try {
      await onDelete(n);
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
      <div
        className="p-2 border-b bg-slate-50 cursor-move"
        title="드래그해서 이동"
        onMouseDown={(e) => {
          const t = e.target as HTMLElement | null;
          if (t?.closest?.("input,button")) return;

          draggingRef.current.active = true;
          draggingRef.current.offsetX = e.clientX - pos.left;
          draggingRef.current.offsetY = e.clientY - pos.top;

          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="flex gap-2">
          <input
            ref={searchRef}
            className="flex-1 h-8 px-2 text-xs border rounded outline-none cursor-text"
            placeholder="여기에 입력"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={busy}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          />

          <button
            type="button"
            className="h-8 px-2 text-xs border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
            onClick={() => {
              if (deleteMode) return;
              if (filtered[0]) void handleSelect(filtered[0]);
            }}
            disabled={busy || deleteMode || filtered.length === 0}
            title={deleteMode ? "삭제 모드에서는 선택할 수 없습니다" : "첫 번째 결과 선택"}
          >
            확인
          </button>
        </div>
      </div>

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
                      void handleSelect(name);
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
                      title="기기상태 삭제"
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

      <div className="p-2 border-t bg-white">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full h-8 text-xs border rounded bg-white hover:bg-slate-50 disabled:opacity-60"
            onClick={handleAddPrompt}
            disabled={busy || !onAdd}
          >
            기기상태 추가
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
            기기상태 삭제
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(ui, document.body);
}