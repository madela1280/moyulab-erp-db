"use client";

type Props = {
  onClick: () => void;
};

export default function ColorButton({ onClick }: Props) {
  const base =
    "inline-flex items-center gap-1.5 text-xs px-2 py-1 border rounded text-slate-800 font-medium";
  const normal = "bg-slate-100 border-slate-200 hover:bg-slate-200 active:bg-slate-300";

  return (
    <button type="button" onClick={onClick} className={`${base} ${normal}`}>
      칼라
    </button>
  );
}