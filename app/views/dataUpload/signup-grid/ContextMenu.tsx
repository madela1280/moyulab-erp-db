"use client";

import { useEffect } from "react";

export default function ContextMenu({
  open,
  x,
  y,
  onClose,
  items,
}: {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  items: Array<{ label: string; onClick: () => void | Promise<void> }>;
}) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // 화면 밖으로 나가지 않게 간단 클램프
  const left = Math.max(6, Math.min(x, window.innerWidth - 180));
  const top = Math.max(6, Math.min(y, window.innerHeight - 200));

  return (
    <div
      className="fixed inset-0 z-[80]"
      onMouseDown={(e) => {
        e.preventDefault();
        onClose();
      }}
      onContextMenu={(e) => {
        // 메뉴 위에서 다시 우클릭해도 브라우저 메뉴 안 뜨게
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="fixed z-[81] min-w-[160px] bg-white border rounded shadow-md py-1"
        style={{ left, top }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            className="w-full text-left text-sm px-3 py-2 hover:bg-slate-50"
            onClick={() => it.onClick()}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}