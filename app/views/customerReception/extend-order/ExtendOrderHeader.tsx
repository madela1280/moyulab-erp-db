"use client";

// app/views/customerReception/extend-order/ExtendOrderHeader.tsx

type ExtendOrderHeaderProps = {
  loading?: boolean;
  isColumnEditMode?: boolean;
  hasSelection?: boolean;
  sending?: boolean;
  onRefresh: () => void;
  onDelete: () => void;
  onSend: () => void;
  onToggleColumnEditMode: () => void;
};

export default function ExtendOrderHeader({
  loading,
  isColumnEditMode,
  hasSelection,
  sending,
  onRefresh,
  onDelete,
  onSend,
  onToggleColumnEditMode,
}: ExtendOrderHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-base font-semibold text-slate-800">연장·연체료</div>

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
        onClick={onSend}
        disabled={!hasSelection || sending}
        className="rounded border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        title="선택한 입금확정 건을 통합관리 n차연장에 기록합니다"
      >
        {sending ? "전송 중..." : "전송"}
      </button>

      <button
        type="button"
        onClick={onDelete}
        disabled={!hasSelection}
        className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        삭제
      </button>
    </div>
  );
}
