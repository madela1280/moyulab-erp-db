"use client";

import { useRef } from "react";
import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid, { UnifiedGridHandle } from "@/unified/components/UnifiedGrid";

export default function UnifiedMainView() {
  const gridRef = useRef<UnifiedGridHandle | null>(null);

  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.3cm" }} />

      <GridHeader
        onAdd10={async () => {
          await gridRef.current?.appendBlankRows(10);
        }}
      />

      <div className="flex-1 min-h-0">
        <UnifiedGrid ref={gridRef} />
      </div>
    </div>
  );
}














