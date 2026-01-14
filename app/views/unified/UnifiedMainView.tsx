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

  const {
    availableColumns,
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
    reloadAllColumnState,
  } = useUnifiedColumnConfig();

  const referenceOptions = useMemo(() => availableColumns, [availableColumns]);

  async function addTemplate(args: {
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

    syncEmitUnifiedUpdate();
    await reloadAllColumnState();
  }

  async function deleteTemplate(key: string) {
    const r = await fetch("/api/unified-columns", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(t || `FAILED(${r.status})`);
    }

    syncEmitUnifiedUpdate();
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
        onAdd={addTemplate}
        onDelete={deleteTemplate}
      />
    </div>
  );
}







