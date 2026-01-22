"use client";

export type ColorApplyMode = "cell" | "text";

type Props = {
  mode: ColorApplyMode;
  onChange: (next: ColorApplyMode) => void;
};

export default function ColorModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={`px-2 py-1 border rounded text-xs ${
          mode === "cell"
            ? "bg-slate-900 text-white border-slate-900"
            : "bg-white text-slate-700 border-slate-200"
        }`}
        onClick={() => onChange("cell")}
      >
        셀(채우기)
      </button>

      <button
        type="button"
        className={`px-2 py-1 border rounded text-xs ${
          mode === "text"
            ? "bg-slate-900 text-white border-slate-900"
            : "bg-white text-slate-700 border-slate-200"
        }`}
        onClick={() => onChange("text")}
      >
        글자
      </button>
    </div>
  );
}