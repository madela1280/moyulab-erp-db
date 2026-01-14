"use client";

import { useMemo, useRef, useState } from "react";
import GridHeader from "@/unified/components/GridHeader";
import UnifiedGrid, { UnifiedGridHandle } from "@/unified/components/UnifiedGrid";
import { useUnifiedColumnConfig } from "@/unified/column-config/useUnifiedColumnConfig";
import AddTemplateModal from "@/unified/components/AddTemplateModal";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";

export default function UnifiedMainView() {
  const gridRef = useRef<UnifiedGridHandle | null>(null);
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);

  const [isAddTemplateOpen, setIsAddTemplateOpen] = useState(false);

  // ✅ (P0~) 컬럼 구성/폭(유저별) + 전역 커스텀 컬럼(양식추가)을 함께 반영하는 훅
  const {
    availableColumns, // 전역(기본+커스텀) 컬럼 전체 목록(정렬된 배열)
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
    reloadAllColumnState,
  } = useUnifiedColumnConfig();

  const referenceOptions = useMemo(() => availableColumns, [availableColumns]);

  async function handleCreateTemplate(args: {
    name: string;
    referenceKey: string;
    position: "after" | "before";
  }) {
    const r = await fetch("/api/unified-columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(t || `FAILED(${r.status})`);
    }

    // 전역 컬럼 변경 → 다른 탭/사용자에게도 알림 (기존 sync 채널 재사용)
    syncEmitUnifiedUpdate();

    // 내 화면도 즉시 반영
    await reloadAllColumnState();
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.3cm" }} />

      <GridHeader
        onAdd10={async () => {
          await gridRef.current?.appendBlankRows(10);
        }}
        isColumnEditMode={isColumnEditMode}
        onToggleColumnEditMode={() => setIsColumnEditMode((v) => !v)}
        onAddTemplate={() => setIsAddTemplateOpen(true)}
      />

      <div className="flex-1 min-h-0">
        <UnifiedGrid
          ref={gridRef}
          isColumnEditMode={isColumnEditMode}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          colWidthUnitByKey={colWidthUnitByKey}
          onColWidthUnitByKeyChange={setColWidthUnitByKey}
        />
      </div>

      <AddTemplateModal
        open={isAddTemplateOpen}
        onClose={() => setIsAddTemplateOpen(false)}
        referenceOptions={referenceOptions}
        onSubmit={async (payload) => {
          await handleCreateTemplate(payload);
          setIsAddTemplateOpen(false);
        }}
      />
    </div>
  );
}












