"use client";

import { useState } from "react";
import ColorModeToggle, { type ColorApplyMode } from "@/devices/symphony/color/ColorModeToggle";

export type SymphonySoftColor =
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

  // ✅ 변경: 모드(글자/셀)까지 함께 전달
  onApply: (color: SymphonySoftColor, mode: ColorApplyMode) => void;
};

const COLORS: Array<{ key: SymphonySoftColor; label: string; swatchClass: string }> = [
  { key: "red", label: "레드", swatchClass: "bg-red-200" },
  { key: "yellow", label: "옐로우", swatchClass: "bg-yellow-200" },
  { key: "blue", label: "블루", swatchClass: "bg-blue-200" },
  { key: "green", label: "그린", swatchClass: "bg-green-200" },
  { key: "purple", label: "퍼플", swatchClass: "bg-purple-200" },
  { key: "black", label: "블랙", swatchClass: "bg-slate-300" },
  { key: "clear", label: "해제", swatchClass: "bg-white" },
];

export default function ColorPopover({ open, anchor, onClose, onApply }: Props) {
  const [mode, setMode] = useState<ColorApplyMode>("cell"); // 기본: 셀(채우기)

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
            <span className={`w-4 h-4 rounded border ${c.swatchClass}`} />
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      <div className="px-2 py-2 border-t flex justify-end">
        <button className="px-3 py-1 border rounded hover:bg-gray-100" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}