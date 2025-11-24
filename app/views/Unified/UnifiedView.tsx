"use client";

import GridHeader from "@/app/unified/components/GridHeader";
import GridTable from "@/app/unified/components/GridTable";

export default function UnifiedView() {
  return (
    <div className="w-full h-full">
      {/* 위 여백 0.5cm */}
      <div style={{ height: "0.5cm" }} />

      <GridHeader />

      {/* 아래 여백 */}
      <div style={{ height: "0.5cm" }} />

      <GridTable />
    </div>
  );
}
