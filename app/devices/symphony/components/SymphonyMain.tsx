"use client";

import { useRef, useState } from "react";

import SymphonyHeader from "@/devices/symphony/components/SymphonyHeader";
import SymphonyGrid, { SymphonyGridHandle } from "@/devices/symphony/components/SymphonyGrid";
import { useSymphonyColumnConfig } from "@/devices/symphony/column-config/useSymphonyColumnConfig";
import { exportSymphonyCsv, insertSymphonyRows } from "@/devices/symphony/service/serviceSymphony";

import AddTemplateModalSymphony from "@/devices/symphony/template/AddTemplateModalSymphony";

import ColorPopover, { type SymphonySoftColor } from "@/devices/symphony/color/ColorPopover";
import type { ColorApplyMode } from "@/devices/symphony/color/ColorModeToggle";

import {
  createEmptyFilterState,
  type ColumnFilterState,
} from "@/devices/symphony/filter/useSymphonyFilter";
import { defaultSortState, type SymphonySortState } from "@/devices/symphony/filter/useSymphonySort";

export default function SymphonyMain() {
  const gridRef = useRef<SymphonyGridHandle | null>(null);

  const [isColumnEditMode, setIsColumnEditMode] = useState(false);

  // Grid 내부 선택/팝오버/드래그 등 UI 상태를 “완전 초기화”해야 할 때는 remount로 처리
  const [gridMountKey, setGridMountKey] = useState(1);

  // 필터/정렬
  const [filterMode, setFilterMode] = useState(false);
  const [filterState, setFilterState] = useState<ColumnFilterState>(() => createEmptyFilterState());
  const [sortState, setSortState] = useState<SymphonySortState>(() => defaultSortState());

  // 칼라
  const [colorOpen, setColorOpen] = useState(false);
  const [colorAnchor, setColorAnchor] = useState<{ x: number; y: number } | null>(null);

  // 양식추가 모달
  const [templateOpen, setTemplateOpen] = useState(false);

  const { columnOrder, setColumnOrder, colWidthUnitByKey, setColWidthUnitByKey } =
    useSymphonyColumnConfig();

  async function handleAdd10() {
    await insertSymphonyRows({ count: 10, beforeId: null, afterId: null });
    await gridRef.current?.reload();
  }

  function handleToggleFilterMode() {
    // 요구사항: 필터 버튼을 “다시” 누르면
    // - 현재 필터/검색/정렬 상태 전부 해제
    // - 숨김/필터링 없는 원상태(기본정렬)로 복귀
    if (filterMode) {
      setFilterMode(false);
      setFilterState(createEmptyFilterState());
      setSortState(defaultSortState());

      // Grid 내부(선택/팝오버 등)까지 원복이 필요하므로 remount
      setGridMountKey((v) => v + 1);
      return;
    }

    setFilterMode(true);
  }

  async function handleDownload() {
    const blob = await exportSymphonyCsv({ filter: { filterState, sortState } });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "symphony.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function openColor(anchor: { x: number; y: number }) {
    setColorAnchor(anchor);
    setColorOpen(true);
  }

  async function applyColor(color: SymphonySoftColor, mode: ColorApplyMode) {
    await gridRef.current?.applyColorToSelection(color, mode);
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.3cm" }} />

      <SymphonyHeader
        onAdd10={handleAdd10}
        isColumnEditMode={isColumnEditMode}
        onToggleColumnEditMode={() => setIsColumnEditMode((v) => !v)}
        onAddTemplate={() => setTemplateOpen(true)}
        filterMode={filterMode}
        onToggleFilterMode={handleToggleFilterMode}
        onOpenColor={openColor}
        onDownload={handleDownload}
      />

      <div className="flex-1 min-h-0">
        <SymphonyGrid
          key={gridMountKey}
          ref={gridRef}
          isColumnEditMode={isColumnEditMode}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          colWidthUnitByKey={colWidthUnitByKey}
          onColWidthUnitByKeyChange={setColWidthUnitByKey}
          filterMode={filterMode}
          filterState={filterState}
          onFilterStateChange={setFilterState}
          sortState={sortState}
          onSortStateChange={setSortState}
        />
      </div>

      <AddTemplateModalSymphony open={templateOpen} onClose={() => setTemplateOpen(false)} />

      <ColorPopover
        open={colorOpen}
        anchor={colorAnchor}
        onClose={() => setColorOpen(false)}
        onApply={applyColor}
      />
    </div>
  );
}