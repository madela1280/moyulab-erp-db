"use client";

import { useMemo, useState } from "react";
import ReturnRequestHeader from "@/customerReception/return-request/ReturnRequestHeader";
import ReturnRequestGrid from "@/customerReception/return-request/ReturnRequestGrid";
import {
  RETURN_REQUEST_CURRENT_COLUMNS,
  RETURN_REQUEST_LIST_COLUMNS,
} from "@/customerReception/return-request/columns";
import type {
  ReturnRequestColumn,
  ReturnRequestRow,
  ReturnRequestViewMode,
} from "@/customerReception/return-request/types";

export default function ReturnRequestView() {
  const [mode, setMode] = useState<ReturnRequestViewMode>("current");
  const [isColumnWidthMode, setIsColumnWidthMode] = useState(false);
  const [currentRows, setCurrentRows] = useState<ReturnRequestRow[]>([]);
  const [listRows, setListRows] = useState<ReturnRequestRow[]>([]);
  const [currentColumns, setCurrentColumns] = useState<ReturnRequestColumn[]>(
    RETURN_REQUEST_CURRENT_COLUMNS
  );
  const [listColumns, setListColumns] = useState<ReturnRequestColumn[]>(
    RETURN_REQUEST_LIST_COLUMNS
  );

  const columns = useMemo(() => {
    return mode === "list" ? listColumns : currentColumns;
  }, [mode, currentColumns, listColumns]);

  const rows = mode === "list" ? listRows : currentRows;

  function handleColumnWidthChange(key: string, width: number) {
    if (mode === "list") {
      setListColumns((prev) =>
        prev.map((col) => (col.key === key ? { ...col, width } : col))
      );
      return;
    }

    setCurrentColumns((prev) =>
      prev.map((col) => (col.key === key ? { ...col, width } : col))
    );
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