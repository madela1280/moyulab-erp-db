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

  return (
    <div className="border-x border-t bg-white px-3 py-2 flex items-center gap-2 flex-wrap">
      {/* ✅ 좌측 타이틀 */}
      <div className="font-semibold text-slate-800 mr-2 select-none">락티나</div>

      <button
        type="button"
        className="px-3 py-1 border rounded hover:bg-gray-50 text-sm"
        onClick={onAdd10}
      >
        +10행
      </button>

      <button
        type="button"
        className={`px-3 py-1 border rounded text-sm ${
          isColumnEditMode
            ? "bg-slate-900 text-white border-slate-900"
            : "bg-white text-slate-700 border-slate-200 hover:bg-gray-50"
        }`}
        onClick={onToggleColumnEditMode}
        title="열 이동/폭 조절"
      >
        열편집
      </button>

      <button
        type="button"
        className="px-3 py-1 border rounded bg-white text-slate-700 border-slate-200 hover:bg-gray-50 text-sm"
        onClick={onAddTemplate}
      >
        양식추가/삭제
      </button>

      <button
        type="button"
        className={`px-3 py-1 border rounded text-sm ${
          filterMode
            ? "bg-slate-900 text-white border-slate-900"
            : "bg-white text-slate-700 border-slate-200 hover:bg-gray-50"
        }`}
        onClick={onToggleFilterMode}
        title="필터 모드"
      >
        필터
      </button>

      <button
        type="button"
        className="px-3 py-1 border rounded bg-white text-slate-700 border-slate-200 hover:bg-gray-50 text-sm"
        onClick={(e) => onOpenColor({ x: e.clientX, y: e.clientY })}
        title="선택 영역에 색 적용"
      >
        칼라
      </button>

      <div className="flex-1" />

      <button
        type="button"
        className="px-3 py-1 border rounded bg-white text-slate-700 border-slate-200 hover:bg-gray-50 text-sm"
        onClick={onDownload}
      >
        다운로드
      </button>
    </div>
  );
}