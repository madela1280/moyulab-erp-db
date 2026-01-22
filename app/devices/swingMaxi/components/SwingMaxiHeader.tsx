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

export default function SwingMaxiHeader(props: Props) {
  const {
    onAdd10,
    isColumnEditMode,
    onToggleColumnEditMode,
    onAddTemplate,
    onToggleFilterMode,
    onOpenColor,
    onDownload,
    filterMode,
  } = props;

  const btnBase =
    "px-3 py-1 rounded text-[12px] border border-transparent bg-gray-100 text-slate-800 hover:bg-gray-200";
  const btnActive =
    "px-3 py-1 rounded text-[12px] border border-transparent bg-slate-900 text-white hover:bg-slate-900";

  return (
    <div className="border-x border-t bg-white px-3 py-2 flex items-center justify-between gap-2">
      {/* 좌측 */}
      <div className="flex items-center gap-2">
        <div className="font-semibold text-slate-900 select-none">
          스윙맥시/프리스타일
        </div>

        <button
          type="button"
          className={filterMode ? btnActive : btnBase}
          onClick={onToggleFilterMode}
        >
          필터
        </button>

        <button
          type="button"
          className={btnBase}
          onClick={(e) => onOpenColor({ x: e.clientX, y: e.clientY })}
        >
          칼라
        </button>
      </div>

      {/* 우측 */}
      <div className="flex items-center gap-2">
        <button type="button" className={btnBase} onClick={onDownload}>
          다운로드
        </button>

        <button type="button" className={btnBase} onClick={onAdd10}>
          행10추가
        </button>

        <button type="button" className={btnBase} onClick={onAddTemplate}>
          양식추가
        </button>

        <button
          type="button"
          className={isColumnEditMode ? btnActive : btnBase}
          onClick={onToggleColumnEditMode}
        >
          열이동
        </button>
      </div>
    </div>
  );
}