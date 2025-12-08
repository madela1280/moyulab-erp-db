"use client";

import { useRef } from "react";
import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid, { UnifiedGridHandle } from "@/unified/components/UnifiedGrid";

export default function UnifiedMainView() {
  const gridRef = useRef<UnifiedGridHandle | null>(null);

  return (
    // 통합관리 전용 레이아웃
    <div className="w-full h-full flex flex-col">
      {/* 상단 여백: 기존 0.5cm → 0.3cm 로 약 40% 줄임 (대/소카테고리와 버튼 사이 간격만 살짝 유지) */}
      <div style={{ height: "0.3cm" }} />

      {/* 버튼 영역 */}
      <GridHeader
        onAdd10={async () => {
          await gridRef.current?.appendBlankRows(10);
        }}
      />

      {/* 버튼과 컬럼(그리드) 사이 여백 완전히 제거 → 바로 컬럼 위에 붙도록 */}
      <div className="flex-1 min-h-0">
        <UnifiedGrid ref={gridRef} />
      </div>
    </div>
  );
}















