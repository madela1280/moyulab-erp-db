"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type MenuItem = {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
};

export default function ContextMenu({
  open,
  x,
  y,
  items,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // 메뉴 위치(뷰포트 밖으로 나가면 살짝 보정)
  const pos = useMemo(() => {
    if (typeof window === "undefined") return { left: x, top: y };

    const PAD = 8;
    const MAX_W = 220;
    const estimatedH = Math.max(36, (items?.length || 1) * 34);

    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;

    let left = x;
    let top = y;

    if (left + MAX_W + PAD > vw) left = Math.max(PAD, vw - MAX_W - PAD);
    if (top + estimatedH + PAD > vh) top = Math.max(PAD, vh - estimatedH - PAD);

    return { left, top };
  }, [x, y, items?.length]);

  // 바깥 클릭/ESC로 닫기
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      const el = menuRef.current;
      const t = e.target as Node | null;
      if (!el || !t) return;

      if (el.contains(t)) return; // 메뉴 내부 클릭은 유지
      onClose();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);

    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  if (!mounted) return null;
  if (!open) return null;

  const menu = (
    <div
      ref={menuRef}
      data-sg-context-menu="1"
      className="fixed z-[9999] min-w-[160px] rounded border bg-white shadow-lg overflow-hidden"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        // ✅ SignupGrid의 window mousedown(메뉴 닫기)로 버블링되지 않게 보강
        e.stopPropagation();
      }}
    >
      {items.map((it, idx) => {
        const disabled = !!it.disabled;
        return (
          <button
            key={`${idx}-${it.label}`}
            type="button"
            disabled={disabled}
            className={[
              "w-full text-left px-3 py-2 text-xs",
              disabled ? "text-slate-300 bg-white" : "text-slate-700 hover:bg-slate-100",
            ].join(" ")}
            onClick={async () => {
              if (disabled) return;
              try {
                await it.onClick();
              } finally {
                onClose();
              }
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );

  return createPortal(menu, document.body);
}