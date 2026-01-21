"use client";

import { useEffect, useRef, useState } from "react";

import LactinaHeader from "@/devices/lactina/components/LactinaHeader";
import LactinaGrid, { LactinaGridHandle } from "@/devices/lactina/components/LactinaGrid";
import { useLactinaColumnConfig } from "@/devices/lactina/column-config/useLactinaColumnConfig";
import { exportLactinaCsv, insertLactinaRows } from "@/devices/lactina/service/serviceLactina";

import AddTemplateModalLactina from "@/devices/lactina/template/AddTemplateModalLactina";

import ColorPopover, { type LactinaSoftColor } from "@/devices/lactina/color/ColorPopover";
import type { ColorApplyMode } from "@/devices/lactina/color/ColorModeToggle";

import {
  createEmptyFilterState,
  type ColumnFilterState,
} from "@/devices/lactina/filter/useLactinaFilter";
import { defaultSortState, type LactinaSortState } from "@/devices/lactina/filter/useLactinaSort";

import { syncListen } from "@/global-sync/sync-engine";

export default function LactinaMain() {
  const gridRef = useRef<LactinaGridHandle | null>(null);

  const [isColumnEditMode, setIsColumnEditMode] = useState(false);

  // Grid 내부 선택/팝오버/드래그 등 UI 상태까지 즉시 초기화/반영하려면 remount가 가장 확실
  const [gridMountKey, setGridMountKey] = useState(1);

  // 필터/정렬
  const [filterMode, setFilterMode] = useState(false);
  const [filterState, setFilterState] = useState<ColumnFilterState>(() => createEmptyFilterState());
  const [sortState, setSortState] = useState<LactinaSortState>(() => defaultSortState());

  // 칼라
  const [colorOpen, setColorOpen] = useState(false);
  const [colorAnchor, setColorAnchor] = useState<{ x: number; y: number } | null>(null);

  // 양식추가 모달
  const [templateOpen, setTemplateOpen] = useState(false);

  const {
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
    reloadAllColumnState, // ✅ 핵심: 양식추가/삭제 즉시 반영용
  } = useLactinaColumnConfig();

  // ✅ 다른 탭/PC의 변경을 수신하면 "점멸 없이(silent)" reload
  useEffect(() => {
    const off = syncListen(() => {
      void gridRef.current?.reload({ silent: true });
    });
    return off;
  }, []);

  async function handleAdd10() {
    await insertLactinaRows({ count: 10, beforeId: null, afterId: null });
    await gridRef.current?.reload();
  }

  function handleToggleFilterMode() {
    // 필터 버튼을 다시 누르면 “필터/정렬/검색” 전부 초기화 + 원상태로
    if (filterMode) {
      setFilterMode(false);
      setFilterState(createEmptyFilterState());
      setSortState(defaultSortState());
      setGridMountKey((v) => v + 1);
      return;
    }
    setFilterMode(true);
  }

  async function handleDownload() {
    const blob = await exportLactinaCsv({ filter: { filterState, sortState } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lactina.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function openColor(anchor: { x: number; y: number }) {
    setColorAnchor(anchor);
    setColorOpen(true);
  }

  async function applyColor(color: LactinaSoftColor, mode: ColorApplyMode) {
    await gridRef.current?.applyColorToSelection(color, mode);
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.3cm" }} />

      <LactinaHeader
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
        <LactinaGrid
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

      <AddTemplateModalLactina
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onChanged={async () => {
          // ✅ 양식추가/삭제 직후 즉시 반영(새로고침/재진입 없이)
          await reloadAllColumnState();
          setGridMountKey((v) => v + 1);
        }}
      />

      <ColorPopover
        open={colorOpen}
        anchor={colorAnchor}
        onClose={() => setColorOpen(false)}
        onApply={applyColor}
      />
    </div>
  );
}