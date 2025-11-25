"use client";

import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid from "@/unified/components/UnifiedGrid";

export default function UnifiedMainView() {
  return (
    <div className="w-full h-full">
      <div style={{ height: "0.5cm" }} />

      <GridHeader onAdd10={() => {}} />

      <div style={{ height: "0.5cm" }} />

      <UnifiedGrid />
    </div>
  );
}















