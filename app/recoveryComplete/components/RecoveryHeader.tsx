"use client";

type Props = {
  title: string;

  onDownload: () => void;
  onAdd10: () => void;

  isColumnEditMode: boolean;
  onToggleColumnEditMode: () => void;

  filterMode?: boolean;
  onToggleFilterMode?: () => void;
};

function Icon({ name }: { name: string }) {
  const cls = "w-4 h-4 text-slate-500";
  switch (name) {
    case "filter":
      return (
        <svg
          viewBox="0 0 24 24"
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z" />
        </svg>
      );
    case "download":
      return (
        <svg
          viewBox="0 0 24 24"
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 3v11" />
          <path d="M8 10.5 12 14.5l4-4" />
          <path d="M4 20h16" />
        </svg>
      );
    case "plus":
      return (
        <svg
          viewBox="0 0 24 24"
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "swap":
      return (
        <svg
          viewBox="0 0 24 24"
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M7 7h12" />
          <path d="M15 3l4 4-4 4" />
          <path d="M17 17H5" />
          <path d="M9 21l-4-4 4-4" />
        </svg>
      );
    default:
      return null;
  }
}

function ToolButton({
  icon,
  children,
  onClick,
  active,
}: {
  icon: string;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const base =
    "inline-flex items-center gap-1.5 text-xs px-2 py-1 border rounded text-slate-800 font-medium";
  const normal =
    "bg-slate-100 border-slate-200 hover:bg-slate-200 active:bg-slate-300";
  const on = "bg-slate-300 border-slate-300 hover:bg-slate-300 active:bg-slate-400";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${active ? on : normal}`}
    >
      <Icon name={icon} />
      <span>{children}</span>
    </button>
  );
}

export default function RecoveryHeader({
  title,
  onDownload,
  onAdd10,
  isColumnEditMode,
  onToggleColumnEditMode,
  filterMode,
  onToggleFilterMode,
}: Props) {
  return (
    <div className="w-full flex items-center gap-2 px-2 py-2 bg-white border-b">
      <span className="text-slate-700 font-semibold text-sm">{title}</span>

      <div className="flex items-center gap-2">
        <ToolButton icon="filter" onClick={onToggleFilterMode} active={!!filterMode}>
          필터
        </ToolButton>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ToolButton icon="download" onClick={onDownload}>
          다운로드
        </ToolButton>

        <ToolButton icon="plus" onClick={onAdd10}>
          행10추가
        </ToolButton>

        <ToolButton icon="swap" onClick={onToggleColumnEditMode} active={isColumnEditMode}>
          열이동
        </ToolButton>
      </div>
    </div>
  );
}