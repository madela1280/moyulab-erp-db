// app/views/unified/UnifiedMainView.tsx
"use client";

import { useRef, useState } from "react";
import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid, { UnifiedGridHandle } from "@/unified/components/UnifiedGrid";
import { useUnifiedColumnConfig } from "@/unified/column-config/useUnifiedColumnConfig";

export default function UnifiedMainView() {
  const gridRef = useRef<UnifiedGridHandle | null>(null);
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);

  // ✅ (P0) 열이동(순서/폭) 설정: DB+/api 기반 로드/저장(외부 모듈)
  const {
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
  } = useUnifiedColumnConfig();

  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.3cm" }} />

      <GridHeader
        onAdd10={async () => {
          await gridRef.current?.appendBlankRows(10);
        }}
        isColumnEditMode={isColumnEditMode}
        onToggleColumnEditMode={() => setIsColumnEditMode((v) => !v)}
      />

      <div className="flex-1 min-h-0">
        <UnifiedGrid
          ref={gridRef}
          isColumnEditMode={isColumnEditMode}
          // ✅ UnifiedGrid 코어는 유지하고, “열 설정 저장”은 외부에서만 처리
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          colWidthUnitByKey={colWidthUnitByKey}
          onColWidthUnitByKeyChange={setColWidthUnitByKey}
        />
      </div>
    </div>
  );
}














