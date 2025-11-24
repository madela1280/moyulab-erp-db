// app/views/Unified/UnifiedView.tsx
"use client";

import GridHeader from "@/app/Unified/components/GridHeader";
import GridTable from "@/app/Unified/components/GridTable";

export default function UnifiedView() {
  return (
    <div className="w-full h-full flex flex-col">

      {/* 카테고리(대메뉴) 아래 빈 공간 0.5cm 확보 */}
      <div style={{ height: "0.5cm" }} />

      {/* 소카테고리 버튼 */}
      <GridHeader />

      {/* 표 */}
      <div className="flex-1 mt-4">
        <GridTable />
      </div>
    </div>
  );
}
