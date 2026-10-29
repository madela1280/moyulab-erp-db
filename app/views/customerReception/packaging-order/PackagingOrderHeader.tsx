"use client";

// app/views/customerReception/packaging-order/PackagingOrderHeader.tsx

type PackagingOrderHeaderProps = {
  loading?: boolean;
  isColumnEditMode?: boolean;
  deleteCount?: number;
  onRefresh: () => void;
  onDelete: () => void;
  onToggleColumnEditMode: () => void;
};

export default function PackagingOrderHeader({
  loading,
  isColumnEditMode,
  deleteCount = 0,
  onRefresh,
  onDelete,
  onToggleColumnEditMode,
}: PackagingOrderHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-base font-semibold text-slate-800">포장재구매</div>

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
          isColumnEditMode
            ? "border-slate-300 bg-slate-300 text-slate-800"
            : "border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200"
        }`}
      >
        열 이동
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200"
      >
        삭제{deleteCount > 0 ? ` (${deleteCount})` : ""}
      </button>
    </div>
  );
}
