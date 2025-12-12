// app/unified/components/ColumnHeaderControls.tsx
"use client";

export default function ColumnHeaderControls({
  visible,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  widthUnit,
  onWidthUnitChange,
}: {
  visible: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  widthUnit: number;
  onWidthUnitChange: (next: number) => void;
}) {
  if (!visible) return null;

  const btn =
    "px-1 py-0.5 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed rounded";
  const input =
    "w-14 h-6 text-[11px] px-1 border border-slate-200 rounded bg-white text-slate-700";

  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btn} disabled={!canMoveLeft} onClick={onMoveLeft}>
        ←
      </button>
      <button type="button" className={btn} disabled={!canMoveRight} onClick={onMoveRight}>
        →
      </button>
      <input
        className={input}
        type="number"
        min={1}
        max={200}
        value={widthUnit}
        onChange={(e) => onWidthUnitChange(Number(e.target.value))}
        title="열 넓이(unit). 20=기준, 1=1/20 수준"
      />
    </div>
  );
}