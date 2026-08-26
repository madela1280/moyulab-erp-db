// app/customerReception/payment-confirm/PaymentConfirmHeader.tsx
"use client";

export default function PaymentConfirmHeader(props: {
  keyword: string;
  onKeywordChange: (v: string) => void;
  selectedCount: number;
  loading?: boolean;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const { keyword, onKeywordChange, selectedCount, loading, onRefresh, onDelete } = props;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-semibold text-gray-800">입금확인</div>
        <div className="text-xs text-gray-500">고객명 · 입금자명 · 금액으로 검색 · 문자 매칭되면 자동으로 입금확인 처리됩니다</div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder="고객명 / 입금자명 / 금액 검색"
          className="border rounded px-2 py-1.5 text-xs w-56"
        />

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
          onClick={onDelete}
          disabled={selectedCount === 0}
          className="rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          삭제{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
      </div>
    </div>
  );
}
