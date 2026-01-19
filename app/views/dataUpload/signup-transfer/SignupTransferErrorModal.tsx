"use client";

export default function SignupTransferErrorModal({
  open,
  message,
  loading,
  onForceTransfer,
  onClose,
}: {
  open: boolean;
  message: string;
  loading?: boolean;
  onForceTransfer: () => void | Promise<void>;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/30 flex items-center justify-center" onMouseDown={onClose}>
      <div
        className="w-[520px] max-w-[92vw] rounded border bg-white shadow-lg p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-semibold text-slate-800">전송 실패</div>

        <div className="mt-3 text-sm text-slate-700 whitespace-pre-wrap break-words">{message || "저장(전송)에 실패했습니다."}</div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className="text-xs px-3 py-2 rounded border bg-white hover:bg-slate-50"
            onClick={onClose}
            disabled={!!loading}
          >
            수정하기
          </button>

          <button
            type="button"
            className="text-xs px-3 py-2 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
            onClick={() => onForceTransfer()}
            disabled={!!loading}
            title="검증 경고가 있어도 강제로 전송"
          >
            강제전송
          </button>
        </div>
      </div>
    </div>
  );
}