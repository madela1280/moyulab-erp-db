"use client";

type Props = {
  onAdd10: () => void;
  onToggleColumnEditMode: () => void;
  isColumnEditMode: boolean;

  onAddTemplate: () => void;
  onOpenFilter: () => void;
  onToggleColor: () => void;
  onDownload: () => void;
};

function ToolButton({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const base =
    "inline-flex items-center gap-1.5 text-xs px-2 py-1 border rounded text-slate-800 font-medium";
  const normal = "bg-slate-100 border-slate-200 hover:bg-slate-200 active:bg-slate-300";
  const on = "bg-slate-300 border-slate-300 hover:bg-slate-300 active:bg-slate-400";

  return (
    <button type="button" onClick={onClick} className={`${base} ${active ? on : normal}`}>
      <span>{children}</span>
    </button>
  );
}

export default function SymphonyHeader({
  onAdd10,
  onToggleColumnEditMode,
  isColumnEditMode,
  onAddTemplate,
  onOpenFilter,
  onToggleColor,
  onDownload,
}: Props) {
  return (
    <div className="w-full flex items-center gap-2 px-2 py-2 bg-white border-b">
      <span className="text-slate-700 font-semibold text-sm">심포니</span>

      <div className="flex items-center gap-2">
        <ToolButton onClick={onOpenFilter}>필터</ToolButton>
        <ToolButton onClick={onToggleColor}>칼라</ToolButton>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ToolButton onClick={onDownload}>다운로드</ToolButton>

        <ToolButton onClick={onAdd10}>행10추가</ToolButton>

        <ToolButton onClick={onAddTemplate}>양식추가</ToolButton>

        <ToolButton onClick={onToggleColumnEditMode} active={isColumnEditMode}>
          열이동
        </ToolButton>
      </div>
    </div>
  );
}