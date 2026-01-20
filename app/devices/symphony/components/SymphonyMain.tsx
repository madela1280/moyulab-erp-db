"use client";

import { useRef, useState } from "react";
import SymphonyHeader from "@/devices/symphony/components/SymphonyHeader";
import SymphonyGrid, { SymphonyGridHandle } from "@/devices/symphony/components/SymphonyGrid";
import { useSymphonyColumnConfig } from "@/devices/symphony/column-config/useSymphonyColumnConfig";
import { insertSymphonyRows, exportSymphonyCsv } from "@/devices/symphony/service/serviceSymphony";

import ColorPopover, { type SymphonySoftColor } from "@/devices/symphony/color/ColorPopover";
import {
  createEmptyFilterState,
  type ColumnFilterState,
} from "@/devices/symphony/filter/useSymphonyFilter";
import { defaultSortState, type SymphonySortState } from "@/devices/symphony/filter/useSymphonySort";

export default function SymphonyMain() {
  const gridRef = useRef<SymphonyGridHandle | null>(null);

  const [isColumnEditMode, setIsColumnEditMode] = useState(false);

  // 필터
  const [filterMode, setFilterMode] = useState(false);
  const [filterState, setFilterState] = useState<ColumnFilterState>(() => createEmptyFilterState());
  const [sortState, setSortState] = useState<SymphonySortState>(() => defaultSortState());

  // 칼라
  const [colorOpen, setColorOpen] = useState(false);
  const [colorAnchor, setColorAnchor] = useState<{ x: number; y: number } | null>(null);

  const { columnOrder, setColumnOrder, colWidthUnitByKey, setColWidthUnitByKey } =
    useSymphonyColumnConfig();

  async function handleAdd10() {
    await insertSymphonyRows({ count: 10, beforeId: null, afterId: null });
    await gridRef.current?.reload();
  }

  async function handleDownload() {
    const blob = await exportSymphonyCsv({
      filter: { filterState, sortState },
    });

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

  async function applyColor(color: SymphonySoftColor) {
    await gridRef.current?.applyColorToSelection(color);
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.3cm" }} />

      <SymphonyHeader
        onAdd10={handleAdd10}
        isColumnEditMode={isColumnEditMode}
        onToggleColumnEditMode={() => setIsColumnEditMode((v) => !v)}
        onAddTemplate={() => {
          alert("양식추가: 준비중");
        }}
        filterMode={filterMode}
        onToggleFilterMode={() => setFilterMode((v) => !v)}
        onOpenColor={openColor}
        onDownload={handleDownload}
      />

      <div className="flex-1 min-h-0">
        <SymphonyGrid
          ref={gridRef}
          isColumnEditMode={isColumnEditMode}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          colWidthUnitByKey={colWidthUnitByKey}
          onColWidthUnitByKeyChange={setColWidthUnitByKey}
          // 필터/정렬 상태(엑셀형)
          filterMode={filterMode}
          filterState={filterState}
          onFilterStateChange={setFilterState}
          sortState={sortState}
          onSortStateChange={setSortState}
        />
      </div>

      <ColorPopover
        open={colorOpen}
        anchor={colorAnchor}
        onClose={() => setColorOpen(false)}
        onApply={applyColor}
      />
    </div>
  );
}