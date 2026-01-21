"use client";

type Props = {
  onAdd10: () => void;

  isColumnEditMode: boolean;
  onToggleColumnEditMode: () => void;

  onAddTemplate: () => void;

  filterMode: boolean;
  onToggleFilterMode: () => void;

  onOpenColor: (anchor: { x: number; y: number }) => void;

  onDownload: () => void;
};

export default function LactinaHeader(props: Props) {
  const {
    onAdd10,
    isColumnEditMode,
    onToggleColumnEditMode,
    onAddTemplate,
    filterMode,
    onToggleFilterMode,
    onOpenColor,
    onDownload,
  } = props;

  const leftBtnBase =
    "px-3 py-1 rounded text-sm border border-transparent bg-gray-100 text-slate-800 hover:bg-gray-200";
  const leftBtnActive =
    "px-3 py-1 rounded text-sm border border-transparent bg-slate-900 text-white hover:bg-slate-900";

  const rightBtnBase =
    "px-3 py-1 rounded text-sm border border-slate-200 bg-white text-slate-700 hover:bg-gray-50";

  return (
    <div className="border-x border-t bg-white px-3 py-2 flex items-center justify-between gap-2">
      {/* 좌측: 탭 형태(심포니와 동일한 배치) */}
      <div className="flex items-center gap-2">
        <div className="font-semibold text-slate-900 select-none">락티나</div>

        <button
          type="button"
          className={filterMode ? leftBtnActive : leftBtnBase}
          onClick={onToggleFilterMode}
        >
          필터
        </button>

        <button
          type="button"
          className={leftBtnBase}
          onClick={(e) => onOpenColor({ x: e.clientX, y: e.clientY })}
        >
          칼라
        </button>
      </div>

      {/* 우측: 액션 버튼(심포니와 동일한 배치/순서) */}
      <div className="flex items-center gap-2">
        <button type="button" className={rightBtnBase} onClick={onDownload}>
          다운로드
        </button>

        <button type="button" className={rightBtnBase} onClick={onAdd10}>
          행10추가
        </button>

        <button type="button" className={rightBtnBase} onClick={onAddTemplate}>
          양식추가
        </button>

        <button
          type="button"
          className={`${rightBtnBase} ${
            isColumnEditMode ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-900" : ""
          }`}
          onClick={onToggleColumnEditMode}
        >
          열이동
        </button>
      </div>
    </div>
  );
}