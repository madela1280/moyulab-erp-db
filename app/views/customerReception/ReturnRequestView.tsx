"use client";

import { useState } from "react";
import ReturnRequestHeader from "@/customerReception/return-request/ReturnRequestHeader";
import ReturnRequestGrid from "@/customerReception/return-request/ReturnRequestGrid";
import { useReturnRequestColumnConfig } from "@/customerReception/return-request/column-config/useReturnRequestColumnConfig";
import type {
  ReturnRequestRow,
  ReturnRequestViewMode,
} from "@/customerReception/return-request/types";

export default function ReturnRequestView() {
  const [mode, setMode] = useState<ReturnRequestViewMode>("current");
  const [isColumnWidthMode, setIsColumnWidthMode] = useState(false);
  const [currentRows, setCurrentRows] = useState<ReturnRequestRow[]>([]);
  const [listRows, setListRows] = useState<ReturnRequestRow[]>([]);
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

  function handleSubmit() {
    alert("전송 기능은 다음 단계에서 연결합니다.");
  }

  function handleDelete() {
    alert("삭제 기능은 다음 단계에서 연결합니다.");
  }

  function handleDownload() {
    alert("다운로드 기능은 다음 단계에서 연결합니다.");
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
        onColumnWidthChange={handleColumnWidthChange}
      />
    </div>
  );
}