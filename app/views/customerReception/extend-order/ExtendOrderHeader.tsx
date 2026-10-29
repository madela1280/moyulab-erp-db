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
        onClick={onSend}
        disabled={sending}
        className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200 disabled:text-slate-400 disabled:hover:bg-slate-100 disabled:cursor-not-allowed"
        title="선택한 입금확정/확인필요 건을 통합관리 n차연장에 기록합니다(입금대기 건은 제외)"
      >
        {sending ? "전송 중..." : "전송"}
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200"
      >
        삭제
      </button>
    </div>
  );
}
