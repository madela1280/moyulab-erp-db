"use client";

// app/views/customerReception/packaging-order/PackagingOrderHeader.tsx

type PackagingOrderHeaderProps = {
  loading?: boolean;
  isColumnEditMode?: boolean;
  onRefresh: () => void;
  onDownloadExcel: () => void;
  onToggleColumnEditMode: () => void;
};

export default function PackagingOrderHeader({
  loading,
  isColumnEditMode,
  onRefresh,
  onDownloadExcel,
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
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {loading ? "불러오는 중..." : "새로고침"}
      </button>

      <button
        type="button"
        onClick={onToggleColumnEditMode}
        className={`rounded border px-3 py-1.5 text-xs font-medium ${
          isColumnEditMode
            ? "border-purple-500 bg-purple-50 text-purple-700"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        }`}
      >
        열 이동
      </button>

      <button
        type="button"
        onClick={onDownloadExcel}
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        엑셀 다운로드
      </button>
    </div>
  );
}
