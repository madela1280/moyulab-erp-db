"use client";

type ReturnRecoveryHeaderProps = {
  onDownloadExcel?: () => void;
  onMoveColumns?: () => void;
  onAddTemplate?: () => void;
  onOpenReturnRequestDate?: () => void;
};

function HeaderButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-[6px] text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60"
      onClick={onClick}
    >
      <span className="text-slate-500">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

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

        <HeaderButton icon="✓" label="반납회수 확인" onClick={onOpenReturnRequestDate} />
      </div>

      <div className="flex items-center gap-2">
        <HeaderButton icon="↓" label="다운로드" onClick={onDownloadExcel} />
        <HeaderButton icon="↔" label="열이동" onClick={onMoveColumns} />
        <HeaderButton icon="＋" label="양식추가" onClick={onAddTemplate} />
      </div>
    </div>
  );
}