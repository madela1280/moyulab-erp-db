"use client";

import { useState } from "react";
import SpecificDateShipmentHeader from "@/views/dataUpload/specific-date-shipment/SpecificDateShipmentHeader";
import SpecificDateShipmentGrid from "@/views/dataUpload/specific-date-shipment/SpecificDateShipmentGrid";
import SpecificDateShipmentTemplateModal from "@/views/dataUpload/specific-date-shipment/template/SpecificDateShipmentTemplateModal";
import { fetchSpecificDateShipmentFromUnified } from "@/views/dataUpload/specific-date-shipment/serviceSpecificDateShipment";
import { mapUnifiedToSpecificDateShipmentRows } from "@/views/dataUpload/specific-date-shipment/mapUnifiedToSpecificDateShipment";
import { downloadSpecificDateShipmentCsv } from "@/views/dataUpload/specific-date-shipment/serviceSpecificDateShipmentExport";
import { useSpecificDateShipmentColumnConfig } from "@/views/dataUpload/specific-date-shipment/column-config/useSpecificDateShipmentColumnConfig";
import type { SpecificDateShipmentRow } from "@/views/dataUpload/specific-date-shipment/columns";

export default function SpecificDateShipmentView() {
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [sourceCount, setSourceCount] = useState(0);
  const [rows, setRows] = useState<SpecificDateShipmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const {
    orderedColumns,
    customColumns,
    loading: columnLoading,
    saving: columnSaving,
    error: columnError,
    saveColumnOrder,
    saveColumnWidth,
    addCustomColumn,
    deleteCustomColumn,
    reloadColumnConfig,
  } = useSpecificDateShipmentColumnConfig();

  async function handleConfirm() {
    setLoading(true);
    setError("");

    try {
      const result = await fetchSpecificDateShipmentFromUnified();
      const nextSourceRows = Array.isArray(result.rows) ? result.rows : [];
      const nextRows = mapUnifiedToSpecificDateShipmentRows(nextSourceRows);

      setSourceCount(nextSourceRows.length);
      setRows(nextRows);
      setHasLoaded(true);
    } catch (e: any) {
      setError(e?.message || "특정일자출고 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadExcel() {
    downloadSpecificDateShipmentCsv(rows, orderedColumns);
  }

  async function handleAddCustomColumn(label: string, referenceKey: string, position: "after" | "before") {
    await addCustomColumn(label, referenceKey, position);
  }

  async function handleDeleteCustomColumn(key: string) {
    await deleteCustomColumn(key);
  }

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <SpecificDateShipmentHeader
        onConfirm={handleConfirm}
        onDownloadExcel={handleDownloadExcel}
        onMoveColumns={() => setIsColumnEditMode((prev) => !prev)}
        onAddTemplate={() => setTemplateModalOpen(true)}
      />

      {(hasLoaded || loading || error || columnError) && (
        <div className="flex items-center gap-3 text-xs">
          {loading && <div className="text-blue-600">불러오는 중...</div>}

          {!loading && hasLoaded && !error && (
            <div className="text-slate-600">
              통합관리 조회 결과: <span className="font-semibold text-slate-800">{sourceCount}</span>건 / 특정일자출고 표시:{" "}
              <span className="font-semibold text-slate-800">{rows.length}</span>건
            </div>
          )}

          {error && <div className="text-red-600">{error}</div>}
          {columnError && <div className="text-red-600">{columnError}</div>}
        </div>
      )}

      <SpecificDateShipmentGrid
        rows={rows}
        columns={orderedColumns}
        isColumnEditMode={isColumnEditMode}
        onRowsChange={setRows}
        onColumnOrderChange={saveColumnOrder}
        onColumnWidthChange={saveColumnWidth}
      />

      <SpecificDateShipmentTemplateModal
        open={templateModalOpen}
        columns={orderedColumns}
        customColumns={customColumns}
        loading={columnLoading}
        saving={columnSaving}
        onClose={() => setTemplateModalOpen(false)}
        onAdd={handleAddCustomColumn}
        onDelete={handleDeleteCustomColumn}
        onReload={reloadColumnConfig}
      />
    </div>
  );
}
