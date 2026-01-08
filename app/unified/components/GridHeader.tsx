// app/unified/components/GridHeader.tsx
"use client";

type Props = {
  onAdd10: () => void;
  isColumnEditMode: boolean;
  onToggleColumnEditMode: () => void;
};

function Icon({ name }: { name: string }) {
  const cls = "w-4 h-4 text-slate-500";
  switch (name) {
    case "folder":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 6.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2V17.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5Z" />
        </svg>
      );
    case "tag":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 12V3h9l9 9-9 9-9-9Z" />
          <path d="M7.5 7.5h.01" />
        </svg>
      );
    case "filter":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
          <path d="M16.5 16.5 21 21" />
        </svg>
      );
    case "palette":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3a9 9 0 1 0 0 18h2a3 3 0 0 0 0-6h-1a2 2 0 0 1-2-2v-.5a2.5 2.5 0 0 1 2.5-2.5H16a3 3 0 0 0 0-6h-4Z" />
          <path d="M7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01M16.5 11.5h.01" />
        </svg>
      );
    case "duplicate":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 8h11v13H8V8Z" />
          <path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M9 12.5 11 14.5 15.5 9.5" />
          <path d="M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />
        </svg>
      );
    case "download":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3v11" />
          <path d="M8 10.5 12 14.5l4-4" />
          <path d="M4 20h16" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "file":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v4h4" />
        </svg>
      );
    case "swap":
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8">
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
  const normal = "bg-slate-100 border-slate-200 hover:bg-slate-200 active:bg-slate-300";
  const on = "bg-slate-300 border-slate-300 hover:bg-slate-300 active:bg-slate-400";

  return (
    <button type="button" onClick={onClick} className={`${base} ${active ? on : normal}`}>
      <Icon name={icon} />
      <span>{children}</span>
    </button>
  );
}

export default function GridHeader({
  onAdd10,
  isColumnEditMode,
  onToggleColumnEditMode,
}: Props) {
  return (
    <div className="w-full flex items-center gap-2 px-2 py-2 bg-white border-b">
      <span className="text-slate-700 font-semibold text-sm">통합관리</span>

      <div className="flex items-center gap-2">
        <ToolButton icon="folder">안내분류</ToolButton>
        <ToolButton icon="tag">분류</ToolButton>
        <ToolButton icon="filter">필터</ToolButton>
        <ToolButton icon="search">검색</ToolButton>
        <ToolButton icon="palette">칼라</ToolButton>
        <ToolButton icon="duplicate">중복</ToolButton>
        <ToolButton icon="check">오류검사</ToolButton>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ToolButton icon="download">다운로드</ToolButton>
        <ToolButton icon="plus" onClick={onAdd10}>
          행10추가
        </ToolButton>
        <ToolButton icon="file">양식추가</ToolButton>

        <ToolButton
          icon="swap"
          onClick={onToggleColumnEditMode}
          active={isColumnEditMode}
        >
          열이동
        </ToolButton>
      </div>
    </div>
  );
}