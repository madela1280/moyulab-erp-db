"use client";

import { useRef } from "react";
import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid, {
  UnifiedGridHandle,
} from "@/unified/components/UnifiedGrid";

export default function UnifiedMainView() {
  const gridRef = useRef<UnifiedGridHandle | null>(null);

  return (
    // 통합관리 전용 레이아웃
    <div className="w-full h-full flex flex-col">
      {/* 상단 여백 */}
      <div style={{ height: "0.3cm" }} />

      {/* 버튼 영역 */}
      <GridHeader
        onAdd10={async () => {
          // 행 10개 추가
          await gridRef.current?.appendBlankRows(10);
        }}
      />

      {/* 그리드 */}
      <div className="flex-1 min-h-0">
        <UnifiedGrid ref={gridRef} />
      </div>
    </div>
  );
}















