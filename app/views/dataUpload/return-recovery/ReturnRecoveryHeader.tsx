"use client";

type ReturnRecoveryHeaderProps = {
  onDownloadExcel?: () => void;
  onMoveColumns?: () => void;
  onAddTemplate?: () => void;
  onAddRows?: () => void;
  onOpenReturnRequestDate?: () => void;
};

export default function ReturnRecoveryHeader({
  onDownloadExcel,
  onMoveColumns,
  onAddTemplate,
  onAddRows,
  onOpenReturnRequestDate,
}: ReturnRecoveryHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="text-base font-semibold text-slate-800">반납회수</div>

        <button
          type="button"
          className="text-xs px-3 py-[6px] rounded bg-blue-50 hover:bg-blue-100 border disabled:opacity-60"
          onClick={onOpenReturnRequestDate}
        >
          반납요청일 확인
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-xs px-3 py-[6px] rounded bg-white hover:bg-slate-50 border disabled:opacity-60"
          onClick={onDownloadExcel}
        >
          다운로드(엑셀)
        </button>

        <button
          type="button"
          className="text-xs px-3 py-[6px] rounded bg-white hover:bg-slate-50 border disabled:opacity-60"
          onClick={onMoveColumns}
        >
          열이동
        </button>

        <button
          type="button"
          className="text-xs px-3 py-[6px] rounded bg-white hover:bg-slate-50 border disabled:opacity-60"
          onClick={onAddTemplate}
        >
          양식추가
        </button>

        <button
          type="button"
          className="text-xs px-3 py-[6px] rounded bg-white hover:bg-slate-50 border disabled:opacity-60"
          onClick={onAddRows}
        >
          행10추가
        </button>
      </div>
    </div>
  );
}