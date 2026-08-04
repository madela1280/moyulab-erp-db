"use client";

type ReturnRecoveryHeaderProps = {
  onDownloadExcel?: () => void;
  onMoveColumns?: () => void;
  onAddTemplate?: () => void;
  onOpenReturnRequestDate?: () => void;
};

export default function ReturnRecoveryHeader({
  onDownloadExcel,
  onMoveColumns,
  onAddTemplate,
  onOpenReturnRequestDate,
}: ReturnRecoveryHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="text-base font-semibold text-slate-800">반납회수</div>

        <button
          type="button"
          className="text-xs px-4 py-[7px] rounded bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 disabled:opacity-60"
          onClick={onOpenReturnRequestDate}
        >
          반납회수 확인
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
      </div>
    </div>
  );
}