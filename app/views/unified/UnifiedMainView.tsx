"use client";

import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid from "@/unified/components/UnifiedGrid";

export default function UnifiedMainView() {
  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.5cm" }} />

      <GridHeader onAdd10={() => {}} />

      <div style={{ height: "0.5cm" }} />

      <div className="flex-1 min-h-0">
        <UnifiedGrid />
      </div>
    </div>
  );
}















