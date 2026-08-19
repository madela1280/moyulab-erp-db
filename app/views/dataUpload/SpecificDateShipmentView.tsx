"use client";

import { useState } from "react";
import SpecificDateShipmentHeader from "@/views/dataUpload/specific-date-shipment/SpecificDateShipmentHeader";
import SpecificDateShipmentGrid from "@/views/dataUpload/specific-date-shipment/SpecificDateShipmentGrid";
import SpecificDateShipmentTemplateModal from "@/views/dataUpload/specific-date-shipment/template/SpecificDateShipmentTemplateModal";
import {
  fetchSpecificDateShipmentFromUnified,
  submitSpecificDateShipmentRows,
} from "@/views/dataUpload/specific-date-shipment/serviceSpecificDateShipment";
import { mapUnifiedToSpecificDateShipmentRows } from "@/views/dataUpload/specific-date-shipment/mapUnifiedToSpecificDateShipment";
import { downloadSpecificDateShipmentCsv } from "@/views/dataUpload/specific-date-shipment/serviceSpecificDateShipmentExport";
import { useSpecificDateShipmentColumnConfig } from "@/views/dataUpload/specific-date-shipment/column-config/useSpecificDateShipmentColumnConfig";
import type { SpecificDateShipmentRow } from "@/views/dataUpload/specific-date-shipment/columns";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";

function normalizeStr(v: unknown) {
  return String(v ?? "").trim();
}

function getCheckedRows(rows: SpecificDateShipmentRow[]) {
  return rows.filter((row) => !!row.checked);
}

export default function SpecificDateShipmentView() {
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
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

      setRows(nextRows);
    } catch (e: any) {
      setError(e?.message || "특정일자출고 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadExcel() {
    downloadSpecificDateShipmentCsv(rows, orderedColumns);
  }

  async function handleSubmit() {
    const checkedRows = getCheckedRows(rows);

    if (!checkedRows.length) {
      alert("전송할 행을 체크해 주세요.");
      return;
    }

    const missingDateRows = checkedRows.filter((row) => !normalizeStr(row.data?.shippingDate));
    if (missingDateRows.length) {
      alert("택배발송일이 비어있는 행이 있습니다. 입력 후 다시 시도해 주세요.");
      return;
    }

    const items = checkedRows.map((row) => ({
      unifiedId: Number(row.data?.__unifiedId),
      shippingDate: normalizeStr(row.data?.shippingDate),
    }));

    const ok = confirm(`체크된 ${items.length}건의 택배발송일을 통합관리에 전송할까요?`);
    if (!ok) return;

    setLoading(true);
    setError("");

    try {
      const result = await submitSpecificDateShipmentRows(items);

      if (result.ok) {
        const submittedIds = new Set(items.map((item) => item.unifiedId));
        setRows((prev) => prev.filter((row) => !submittedIds.has(Number(row.data?.__unifiedId))));
        syncEmitUnifiedUpdate();
        alert(`전송이 완료되었습니다.\n성공: ${result.successCount || items.length}건`);
        return;
      }

      const failedMessage = (result.failedRows || [])
        .slice(0, 10)
        .map((f, i) => `${i + 1}. ${f.message}`)
        .join("\n");

      alert([result.message || "전송하지 못했습니다.", failedMessage].filter(Boolean).join("\n"));
    } catch (e: any) {
      alert(e?.message || "전송 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
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
        onSubmit={handleSubmit}
        onDownloadExcel={handleDownloadExcel}
        onMoveColumns={() => setIsColumnEditMode((prev) => !prev)}
        onAddTemplate={() => setTemplateModalOpen(true)}
      />

      {(loading || error || columnError) && (
        <div className="flex items-center gap-3 text-xs">
          {loading && <div className="text-blue-600">불러오는 중...</div>}
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
