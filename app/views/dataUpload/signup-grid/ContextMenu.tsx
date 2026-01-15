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

  return (
    <div
      className="fixed inset-0 z-[80]"
      onMouseDown={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="fixed z-[81] min-w-[140px] bg-white border rounded shadow-md py-1"
        style={{ left: x, top: y }}
        onMouseDown={(e) => e.stopPropagation()}
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