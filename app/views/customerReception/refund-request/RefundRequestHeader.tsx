"use client";

// app/views/customerReception/refund-request/RefundRequestHeader.tsx

type RefundRequestHeaderProps = {
  loading?: boolean;
  isColumnEditMode?: boolean;
  hasSelection?: boolean;
  onRefresh: () => void;
  onDelete: () => void;
  onToggleColumnEditMode: () => void;
  onDownload: () => void;
};

export default function RefundRequestHeader({
  loading,
  isColumnEditMode,
  hasSelection,
  onRefresh,
  onDelete,
  onToggleColumnEditMode,
  onDownload,
}: RefundRequestHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-base font-semibold text-slate-800">환불접수</div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200 disabled:text-slate-400 disabled:hover:bg-slate-100 disabled:cursor-not-allowed"
      >
        {loading ? "불러오는 중..." : "새로고침"}
      </button>

      <button
        type="button"
        onClick={onToggleColumnEditMode}
        className={`rounded border px-2 py-1 text-xs font-medium ${
          isColumnEditMode ? "border-slate-300 bg-slate-300 text-slate-800" : "border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200"
        }`}
      >
        열 이동
      </button>

      <button
        type="button"
        onClick={onDelete}
        disabled={!hasSelection}
        className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200 disabled:text-slate-400 disabled:hover:bg-slate-100 disabled:cursor-not-allowed"
      >
        삭제
      </button>

      <button
        type="button"
        onClick={onDownload}
        className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200"
      >
        다운로드
      </button>
    </div>
  );
}
