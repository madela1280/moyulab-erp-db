// app/views/unified/UnifiedMainView.tsx
"use client";

import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid from "@/unified/components/UnifiedGrid";

export default function UnifiedMainView() {
  return (
    <div className="w-full h-full">
      <div style={{ height: "0.5cm" }} />

      <GridHeader />

      <div style={{ height: "0.5cm" }} />

      <UnifiedGrid />
    </div>
  );
}













