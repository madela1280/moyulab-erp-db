// app/views/unified/UnifiedMainView.tsx
"use client";

import GridHeader from "@/app/unified/components/GridHeader";
import GridTable from "@/app/unified/components/GridTable";
import UnifiedGrid from "@/app/unified/components/UnifiedGrid";

export default function UnifiedMainView() {
  return (
    <div className="w-full h-full">
      <div style={{ height: "0.5cm" }} />

      <GridHeader onAdd10={() => {}} />

      <div style={{ height: "0.5cm" }} />

      {/* 기존 GridTable은 UI 샘플이므로 실제 데이터는 UnifiedGrid 렌더링 */}
      <UnifiedGrid />
    </div>
  );
}











