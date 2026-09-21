"use client";

import { useRef, useState } from "react";
import RecoveryHeader from "@/recoveryComplete/components/RecoveryHeader";
import RecoveryGrid, {
  type RecoveryGridHandle,
} from "@/recoveryComplete/components/RecoveryGrid";

import { useRecoveryColumnConfig } from "@/recoveryComplete/column-config/useRecoveryColumnConfig";
import {
  createEmptyFilterState,
  type ColumnFilterState,
} from "@/unified/filter/useUnifiedFilter";
import {
  defaultSortState,
  type UnifiedSortState,
} from "@/unified/filter/useUnifiedSort";

import { exportRecoveryCsv } from "@/recoveryComplete/export/serviceRecoveryExport";
import RestoreToUnifiedPanel from "@/recoveryComplete/components/RestoreToUnifiedPanel";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";

export type RecoveryScope = "recovery1" | "recovery2";

export default function RecoveryMain({ scope }: { scope: RecoveryScope }) {
  const gridRef = useRef<RecoveryGridHandle | null>(null);

  const [isColumnEditMode, setIsColumnEditMode] = useState(false);

  // ✅ (추가) 회수1 전용: 통합관리로 복구 팝업(완전 별도 배치 기능)
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);

  // 필터/정렬
  const [filterMode, setFilterMode] = useState(false);
  const [filterState, setFilterState] = useState<ColumnFilterState>(() =>
    createEmptyFilterState()
  );
  const [sortState, setSortState] = useState<UnifiedSortState>(() =>
    defaultSortState()
  );

  const {
    availableColumns,
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
  } = useRecoveryColumnConfig(scope);

  function handleToggleFilterMode() {
    if (filterMode) {
      setFilterMode(false);
      setFilterState(createEmptyFilterState());
      setSortState(defaultSortState());

      requestAnimationFrame(() => {
        gridRef.current?.scrollToTailData?.();
      });

      return;
    }
    setFilterMode(true);
  }

  async function handleDownload() {
    const blob = await exportRecoveryCsv({
      scope,
      filter: { filterState, sortState },
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scope}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div style={{ height: "0.3cm" }} />

      {scope === "recovery1" && (
        <div className="flex justify-end px-2 py-1">
          <button
            type="button"
            className="text-xs px-3 py-1.5 border rounded bg-white hover:bg-slate-50"
            onClick={() => setIsRestoreOpen(true)}
          >
            통합관리로 복구
          </button>
        </div>
      )}

      <RecoveryHeader
        title={scope === "recovery1" ? "회수1" : "회수2"}
        onDownload={handleDownload}
        onAdd10={async () => {
          await gridRef.current?.appendBlankRows(10);
        }}
        isColumnEditMode={isColumnEditMode}
        onToggleColumnEditMode={() => setIsColumnEditMode((v) => !v)}
        filterMode={filterMode}
        onToggleFilterMode={handleToggleFilterMode}
      />

      <div className="flex-1 min-h-0">
        <RecoveryGrid
          ref={gridRef}
          scope={scope}
          title={scope === "recovery1" ? "회수1" : "회수2"}
          isColumnEditMode={isColumnEditMode}
          availableColumns={availableColumns}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          colWidthUnitByKey={colWidthUnitByKey}
          onColWidthUnitByKeyChange={setColWidthUnitByKey}
          filterMode={filterMode}
          filterState={filterState}
          onFilterStateChange={setFilterState}
          sortState={sortState}
          onSortStateChange={setSortState}
        />
      </div>

      {scope === "recovery1" && (
        <RestoreToUnifiedPanel
          open={isRestoreOpen}
          onClose={() => setIsRestoreOpen(false)}
          onRestored={() => {
            syncEmitUnifiedUpdate();
          }}
        />
      )}
    </div>
  );
}