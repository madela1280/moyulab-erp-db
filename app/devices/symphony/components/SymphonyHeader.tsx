"use client";

import FilterButton from "@/devices/symphony/filter/FilterButton";
import ColorButton from "@/devices/symphony/color/ColorButton";

type Props = {
  onAdd10: () => void;

  // 열이동
  isColumnEditMode: boolean;
  onToggleColumnEditMode: () => void;

  // 양식추가(추후)
  onAddTemplate: () => void;

  // 필터
  filterMode: boolean;
  onToggleFilterMode: () => void;

  // 칼라
  onOpenColor: (anchor: { x: number; y: number }) => void;

  // 다운로드
  onDownload: () => void;
};

function ToolButton({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const base =
    "inline-flex items-center gap-1.5 text-xs px-2 py-1 border rounded text-slate-800 font-medium";
  const normal = "bg-slate-100 border-slate-200 hover:bg-slate-200 active:bg-slate-300";
  const on = "bg-slate-300 border-slate-300 hover:bg-slate-300 active:bg-slate-400";

  return (
    <button type="button" onClick={onClick} className={`${base} ${active ? on : normal}`}>
      <span>{children}</span>
    </button>
  );
}

export default function SymphonyHeader({
  onAdd10,
  isColumnEditMode,
  onToggleColumnEditMode,
  onAddTemplate,
  filterMode,
  onToggleFilterMode,
  onOpenColor,
  onDownload,
}: Props) {
  return (
    <div className="w-full flex items-center gap-2 px-2 py-2 bg-white border-b">
      <span className="text-slate-700 font-semibold text-sm">심포니</span>

      <div className="flex items-center gap-2">
        <FilterButton active={filterMode} onClick={onToggleFilterMode} />
        <ColorButton
          onClick={() => {
            // 버튼 클릭 위치 기준으로 팝오버 anchor를 만들기 위해, 마지막 마우스 위치 사용
            // (정확한 anchor는 SymphonyMain에서 event로 받게 해도 됨)
            const x = window.innerWidth / 2;
            const y = 80;
            onOpenColor({ x, y });
          }}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ToolButton onClick={onDownload}>다운로드</ToolButton>
        <ToolButton onClick={onAdd10}>행10추가</ToolButton>
        <ToolButton onClick={onAddTemplate}>양식추가</ToolButton>
        <ToolButton onClick={onToggleColumnEditMode} active={isColumnEditMode}>
          열이동
        </ToolButton>
      </div>
    </div>
  );
}