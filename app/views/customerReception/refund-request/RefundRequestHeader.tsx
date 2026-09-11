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
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {loading ? "불러오는 중..." : "새로고침"}
      </button>

      <button
        type="button"
        onClick={onToggleColumnEditMode}
        className={`rounded border px-3 py-1.5 text-xs font-medium ${
          isColumnEditMode ? "border-purple-500 bg-purple-50 text-purple-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        열 이동
      </button>

      <button
        type="button"
        onClick={onDelete}
        disabled={!hasSelection}
        className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        삭제
      </button>

      <button
        type="button"
        onClick={onDownload}
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        다운로드
      </button>
    </div>
  );
}
