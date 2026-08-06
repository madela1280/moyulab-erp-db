"use client";

import { useState } from "react";
import ReturnRecoveryHeader from "@/views/dataUpload/return-recovery/ReturnRecoveryHeader";
import ReturnRecoveryGrid from "@/views/dataUpload/return-recovery/ReturnRecoveryGrid";
import ReturnRequestDateModal from "@/views/dataUpload/return-recovery/ReturnRequestDateModal";
import ReturnRecoveryTemplateModal from "@/views/dataUpload/return-recovery/template/ReturnRecoveryTemplateModal";
import {
  fetchReturnRecoveryFromUnified,
  type ReturnRecoveryUnifiedSourceRow,
} from "@/views/dataUpload/return-recovery/serviceReturnRecovery";
import { mapUnifiedToReturnRecoveryRows } from "@/views/dataUpload/return-recovery/mapUnifiedToReturnRecovery";
import { downloadReturnRecoveryCsv } from "@/views/dataUpload/return-recovery/serviceReturnRecoveryExport";
import { useReturnRecoveryColumnConfig } from "@/views/dataUpload/return-recovery/column-config/useReturnRecoveryColumnConfig";
import type { ReturnRecoveryRow } from "@/views/dataUpload/return-recovery/columns";

export default function ReturnRecoveryView() {
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [selectedReturnRequestDate, setSelectedReturnRequestDate] = useState("");
  const [sourceRows, setSourceRows] = useState<ReturnRecoveryUnifiedSourceRow[]>([]);
  const [mappedRows, setMappedRows] = useState<ReturnRecoveryRow[]>([]);
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
  } = useReturnRecoveryColumnConfig();

  async function handleConfirmReturnRequestDate(dateText: string) {
    const date = String(dateText || "").trim();
    if (!date) return;

    setLoading(true);
    setError("");

    try {
      const result = await fetchReturnRecoveryFromUnified(date);
      const nextSourceRows = Array.isArray(result.rows) ? result.rows : [];
      const nextMappedRows = mapUnifiedToReturnRecoveryRows(nextSourceRows);

      setSelectedReturnRequestDate(date);
      setSourceRows(nextSourceRows);
      setMappedRows(nextMappedRows);
      setDateModalOpen(false);
    } catch (e: any) {
      setError(e?.message || "반납회수 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadExcel() {
    downloadReturnRecoveryCsv(mappedRows, orderedColumns);
  }

  async function handleAddCustomColumn(label: string) {
    await addCustomColumn(label);
  }

  async function handleDeleteCustomColumn(key: string) {
    await deleteCustomColumn(key);
  }

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <ReturnRecoveryHeader
        onOpenReturnRequestDate={() => setDateModalOpen(true)}
        onDownloadExcel={handleDownloadExcel}
        onMoveColumns={() => setIsColumnEditMode((prev) => !prev)}
        onAddTemplate={() => setTemplateModalOpen(true)}
      />

      {(selectedReturnRequestDate || loading || error || columnError) && (
        <div className="flex items-center gap-3 text-xs">
          {selectedReturnRequestDate && (
            <div className="text-slate-600">
              선택한 반납요청일: <span className="font-semibold text-slate-800">{selectedReturnRequestDate}</span>
            </div>
          )}

          {loading && <div className="text-blue-600">불러오는 중...</div>}

          {!loading && selectedReturnRequestDate && !error && (
            <div className="text-slate-600">
              통합관리 조회 결과: <span className="font-semibold text-slate-800">{sourceRows.length}</span>건 / 반납회수 표시:{" "}
              <span className="font-semibold text-slate-800">{mappedRows.length}</span>건
            </div>
          )}

          {error && <div className="text-red-600">{error}</div>}
          {columnError && <div className="text-red-600">{columnError}</div>}
        </div>
      )}

     <ReturnRecoveryGrid
        rows={mappedRows}
        columns={orderedColumns}
        isColumnEditMode={isColumnEditMode}
        onRowsChange={setMappedRows}
        onColumnOrderChange={saveColumnOrder}
        onColumnWidthChange={saveColumnWidth}
      />

      <ReturnRequestDateModal
        open={dateModalOpen}
        onClose={() => setDateModalOpen(false)}
        onConfirm={handleConfirmReturnRequestDate}
      />
      
      <ReturnRecoveryTemplateModal
        open={templateModalOpen}
        customColumns={customColumns}
        loading={columnLoading}
        saving={columnSaving}
        error={columnError}
        onClose={() => setTemplateModalOpen(false)}
        onAdd={handleAddCustomColumn}
        onDelete={handleDeleteCustomColumn}
      />
    </div>
  );
}