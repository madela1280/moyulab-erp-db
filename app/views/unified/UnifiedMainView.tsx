"use client";

import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid from "@/unified/components/UnifiedGrid";

export default function UnifiedMainView() {
  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.5cm" }} />

      <GridHeader onAdd10={() => {}} />

      <div style={{ height: "0.5cm" }} />

      {/* 남은 세로 공간 전체를 그리드가 차지 */}
      <div className="flex-1 min-h-0">
        <UnifiedGrid />
      </div>
    </div>
  );
}















