"use client";

type Props = {
  active: boolean;
  onClick: () => void;
};

export default function FilterButton({ active, onClick }: Props) {
  const base =
    "inline-flex items-center gap-1.5 text-xs px-2 py-1 border rounded text-slate-800 font-medium";
  const normal = "bg-slate-100 border-slate-200 hover:bg-slate-200 active:bg-slate-300";
  const on = "bg-slate-300 border-slate-300 hover:bg-slate-300 active:bg-slate-400";

  return (
    <button type="button" onClick={onClick} className={`${base} ${active ? on : normal}`}>
      필터
    </button>
  );
}