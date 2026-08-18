"use client";

import { useState } from "react";
import ReturnRequestHeader from "@/customerReception/return-request/ReturnRequestHeader";
import ReturnRequestGrid from "@/customerReception/return-request/ReturnRequestGrid";
import { useReturnRequestColumnConfig } from "@/customerReception/return-request/column-config/useReturnRequestColumnConfig";
import { useReturnRequests } from "@/customerReception/return-request/useReturnRequests";
import { downloadReturnRequestCsv } from "@/customerReception/return-request/serviceReturnRequestExport";
import type {
  ReturnRequestRow,
  ReturnRequestViewMode,
} from "@/customerReception/return-request/types";

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function isRealRow(row: ReturnRequestRow) {
  return !!row?.id && !String(row.id).startsWith("empty-");
}

function getCheckedRows(rows: ReturnRequestRow[]) {
  return rows.filter((row) => isRealRow(row) && !!row.checked);
}

function getMismatchRows(rows: ReturnRequestRow[]) {
  return rows.filter((row) => normalizeString(row.data?.mismatchReason));
}

function buildMismatchAlertMessage(rows: ReturnRequestRow[]) {
  const preview = rows
    .slice(0, 10)
    .map((row, index) => {
      const name = normalizeString(row.data?.recipientName);
      const phone = normalizeString(row.data?.phone1);
      const reason = normalizeString(row.data?.mismatchReason);

      return `${index + 1}. ${name || "-"} / ${phone || "-"} : ${reason}`;
    })
    .join("\n");

  const more = rows.length > 10 ? `\n외 ${rows.length - 10}건` : "";

  return [
    "불일치사유가 있는 행은 전송할 수 없습니다.",
    "수정 후 불일치사유가 사라진 뒤 다시 전송해 주세요.",
    "",
    preview,
    more,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFailedRowsMessage(failedRows: any[]) {
  if (!Array.isArray(failedRows) || failedRows.length === 0) return "";

  const preview = failedRows
    .slice(0, 10)
    .map((row, index) => {
      const name = normalizeString(row?.renterName);
      const phone = normalizeString(row?.phone);
      const message = normalizeString(row?.message);

      return `${index + 1}. ${name || "-"} / ${phone || "-"} : ${message || "실패"}`;
    })
    .join("\n");

  const more = failedRows.length > 10 ? `\n외 ${failedRows.length - 10}건` : "";

  return `${preview}${more}`;
}

export default function ReturnRequestView() {
  const [mode, setMode] = useState<ReturnRequestViewMode>("current");
  const [isColumnWidthMode, setIsColumnWidthMode] = useState(false);

  const {
    currentRows,
    listRows,
    setCurrentRows,
    setListRows,
    saveWebCell,
    submitCheckedRows,
    deleteCheckedRows,
  } = useReturnRequests(mode);

  const {
    currentColumns,
    listColumns,
    loading: columnLoading,
    saving: columnSaving,
    error: columnError,
    saveColumnWidth,
  } = useReturnRequestColumnConfig();

  const columns = mode === "list" ? listColumns : currentColumns;
  const rows = mode === "list" ? listRows : currentRows;

  function handleColumnWidthChange(key: string, width: number) {
    void saveColumnWidth(key, width);
  }

  function handleRowsChange(nextRows: ReturnRequestRow[]) {
    if (mode === "list") {
      setListRows(nextRows);
      return;
    }

    setCurrentRows(nextRows);
  }

  async function handleSubmit() {
    if (mode === "list") {
      return;
    }

    const checkedRows = getCheckedRows(currentRows);

    if (!checkedRows.length) {
      alert("전송할 행을 체크해 주세요.");
      return;
    }

    const mismatchRows = getMismatchRows(checkedRows);

    if (mismatchRows.length > 0) {
      alert(buildMismatchAlertMessage(mismatchRows));
      return;
    }

    const ok = confirm(
      `체크된 ${checkedRows.length}건을 전송할까요?\n\n웹접수 반납요청일은 통합관리 반납요청일에 저장되고,\n웹접수 반납메모는 통합관리 반납메모에 저장됩니다.`
    );

    if (!ok) {
      return;
    }

    try {
      const result = await submitCheckedRows(checkedRows);

      if (result?.ok) {
        alert(`전송이 완료되었습니다.\n성공: ${result.successCount || checkedRows.length}건`);
        return;
      }

      const failedMessage = buildFailedRowsMessage(result?.failedRows || []);
      alert(
        [
          result?.message || "전송하지 못했습니다.",
          failedMessage ? "" : "",
          failedMessage,
        ]
          .filter(Boolean)
          .join("\n")
      );
    } catch (e: any) {
      alert(e?.message || "전송 처리 중 오류가 발생했습니다.");
    }
  }

  async function handleDelete() {
    if (mode === "list") {
      return;
    }

    const checkedRows = getCheckedRows(currentRows);

    if (!checkedRows.length) {
      alert("삭제할 행을 체크해 주세요.");
      return;
    }

    const ok = confirm(
      `체크된 ${checkedRows.length}건을 반납접수 화면에서 삭제할까요?\n\n실제 데이터는 삭제되지 않고, 리스트에는 계속 남습니다.`
    );

    if (!ok) {
      return;
    }

    try {
      const result = await deleteCheckedRows(checkedRows);

      if (result?.ok) {
        alert(`삭제 처리가 완료되었습니다.\n성공: ${result.successCount || checkedRows.length}건`);
        return;
      }

      const failedMessage = buildFailedRowsMessage(result?.failedRows || []);
      alert(
        [result?.message || "삭제 처리하지 못했습니다.", failedMessage]
          .filter(Boolean)
          .join("\n")
      );
    } catch (e: any) {
      alert(e?.message || "삭제 처리 중 오류가 발생했습니다.");
    }
  }

  function handleDownload() {
    if (mode !== "list") {
      return;
    }

    downloadReturnRequestCsv(listRows, listColumns);
  }

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <ReturnRequestHeader
        mode={mode}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        onList={() => setMode("list")}
        onCurrent={() => setMode("current")}
        onToggleColumnWidth={() => setIsColumnWidthMode((prev) => !prev)}
        onDownload={handleDownload}
      />

     {(columnLoading || columnSaving || columnError) && (
        <div className="flex items-center gap-3 text-xs">
          {columnLoading && <div className="text-blue-600">열넓이 불러오는 중...</div>}
          {columnSaving && <div className="text-blue-600">열넓이 저장 중...</div>}
          {columnError && <div className="text-red-600">{columnError}</div>}
        </div>
      )}

      <ReturnRequestGrid
        mode={mode}
        rows={rows}
        columns={columns}
        isColumnWidthMode={isColumnWidthMode}
        onRowsChange={handleRowsChange}
        onCellCommit={saveWebCell}
        onColumnWidthChange={handleColumnWidthChange}
      />
    </div>
  );
}