"use client";

import type { ReturnRequestViewMode } from "@/customerReception/return-request/types";

type ReturnRequestHeaderProps = {
  mode: ReturnRequestViewMode;
  onSubmit?: () => void;
  onDelete?: () => void;
  onList?: () => void;
  onCurrent?: () => void;
  onToggleColumnWidth?: () => void;
  onDownload?: () => void;
};

function HeaderButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-[6px] text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

export default function ReturnRequestHeader({
  mode,
  onSubmit,
  onDelete,
  onList,
  onCurrent,
  onToggleColumnWidth,
  onDownload,
}: ReturnRequestHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="text-base font-semibold text-slate-800">
          {mode === "list" ? "리스트" : "반납접수"}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {mode === "list" ? (
          <>
            <HeaderButton label="현재화면" onClick={onCurrent} />
            <HeaderButton label="열넓이" onClick={onToggleColumnWidth} />
            <HeaderButton label="다운로드" onClick={onDownload} />
          </>
        ) : (
          <>
            <HeaderButton label="전송" onClick={onSubmit} />
            <HeaderButton label="삭제" onClick={onDelete} />
            <HeaderButton label="리스트" onClick={onList} />
            <HeaderButton label="열넓이" onClick={onToggleColumnWidth} />
          </>
        )}
      </div>
    </div>
  );
}