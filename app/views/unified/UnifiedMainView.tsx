"use client";

import { useRef } from "react";
import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid, { UnifiedGridHandle } from "@/unified/components/UnifiedGrid";
import { UNIFIED_COLUMNS } from "@/unified/columns/unifiedColumns";
import { useUnifiedColumnConfig } from "@/unified/column-config/useUnifiedColumnConfig";

export default function UnifiedMainView() {
  const gridRef = useRef<UnifiedGridHandle | null>(null);

  const col = useUnifiedColumnConfig(UNIFIED_COLUMNS);

  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.3cm" }} />

      <GridHeader
        onAdd10={async () => {
          await gridRef.current?.appendBlankRows(10);
        }}
        isColumnEditMode={col.isColumnEditMode}
        onToggleColumnEditMode={col.toggleColumnEditMode}
      />

      <div className="flex-1 min-h-0">
        <UnifiedGrid
          ref={gridRef}
          isColumnEditMode={col.isColumnEditMode}
          columnOrder={col.columnOrder}
          colWidthUnitByKey={col.colWidthUnitByKey}
          colWidthPxByKey={col.colWidthPxByKey}
          onMoveColumnLeft={col.moveColumnLeft}
          onMoveColumnRight={col.moveColumnRight}
          onChangeColumnWidthUnit={col.setColumnWidthUnit}
        />
      </div>
    </div>
  );
}














