"use client";

import { useState } from "react";
import ColorModeToggle, { type ColorApplyMode } from "@/devices/simile/color/ColorModeToggle";

export type SimileSoftColor =
  | "red"
  | "yellow"
  | "blue"
  | "green"
  | "purple"
  | "black"
  | "clear";

type Props = {
  open: boolean;
  anchor: { x: number; y: number } | null;
  onClose: () => void;

  onApply: (color: SimileSoftColor, mode: ColorApplyMode) => void;
};

const COLORS: Array<{ key: SimileSoftColor; label: string; swatchStyle?: React.CSSProperties }> = [
  { key: "red", label: "레드", swatchStyle: { backgroundColor: "#FECACA" } },
  { key: "yellow", label: "옐로우", swatchStyle: { backgroundColor: "#FEF08A" } },
  { key: "blue", label: "블루", swatchStyle: { backgroundColor: "#BFDBFE" } },
  { key: "green", label: "그린", swatchStyle: { backgroundColor: "#BBF7D0" } },
  { key: "purple", label: "퍼플", swatchStyle: { backgroundColor: "#E9D5FF" } },
  { key: "black", label: "블랙", swatchStyle: { backgroundColor: "#CBD5E1" } },
  { key: "clear", label: "해제", swatchStyle: { backgroundColor: "#FFFFFF" } },
];

export default function ColorPopover({ open, anchor, onClose, onApply }: Props) {
  const [mode, setMode] = useState<ColorApplyMode>("cell");

  if (!open || !anchor) return null;

  return (
    <div
      className="fixed z-50 bg-white border shadow text-xs rounded"
      style={{ top: anchor.y, left: anchor.x, width: 240 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b font-semibold text-slate-700">칼라</div>

      <div className="px-3 py-2 border-b">
        <ColorModeToggle mode={mode} onChange={setMode} />
      </div>

      <div className="p-2 grid grid-cols-2 gap-2">
        {COLORS.map((c) => (
          <button
            key={c.key}
            className="flex items-center gap-2 px-2 py-2 border rounded hover:bg-gray-50"
            onClick={() => {
              onApply(c.key, mode);
              onClose();
            }}
            type="button"
          >
            <span className="w-4 h-4 rounded border" style={c.swatchStyle} />
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      <div className="px-2 py-2 border-t flex justify-end">
        <button className="px-3 py-1 border rounded hover:bg-gray-100" onClick={onClose} type="button">
          닫기
        </button>
      </div>
    </div>
  );
}