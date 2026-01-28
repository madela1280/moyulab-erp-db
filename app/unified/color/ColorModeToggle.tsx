"use client";

export type ColorApplyMode = "text" | "cell";

type Props = {
  mode: ColorApplyMode;
  onChange: (next: ColorApplyMode) => void;
};

export default function ColorModeToggle({ mode, onChange }: Props) {
  const base = "inline-flex items-center gap-1 text-xs px-2 py-1 border rounded font-medium";
  const on = "bg-slate-300 border-slate-300 text-slate-800";
  const off = "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200";

  return (
    <div className="flex items-center gap-2">
      <button type="button" className={`${base} ${mode === "text" ? on : off}`} onClick={() => onChange("text")}>
        글자
      </button>

      <button type="button" className={`${base} ${mode === "cell" ? on : off}`} onClick={() => onChange("cell")}>
        셀(채우기)
      </button>
    </div>
  );
}