"use client";

// app/views/customerReception/PackagingOrderView.tsx
//
// 고객접수 > 포장재구매. 카카오 챗봇으로 접수된 포장재구매 요청을 그리드로 보여준다.
// 데이터업로드>반납회수와 같은 그리드 조작(열 이동, 엑셀 다운로드, 영역지정 복사/삭제)을 제공하되
// "반납요청일 선택해서 통합관리에서 불러오기" 기능은 없다 — payment_orders에서 바로 조회한다.

import { useEffect, useState } from "react";
import PackagingOrderHeader from "@/views/customerReception/packaging-order/PackagingOrderHeader";
import PackagingOrderGrid from "@/views/customerReception/packaging-order/PackagingOrderGrid";
import { fetchPackagingOrders } from "@/views/customerReception/packaging-order/service";
import { downloadPackagingOrderCsv } from "@/views/customerReception/packaging-order/serviceExport";
import {
  PACKAGING_ORDER_COLUMNS,
  type PackagingOrderColumn,
  type PackagingOrderRow,
} from "@/views/customerReception/packaging-order/columns";

export default function PackagingOrderView() {
  const [rows, setRows] = useState<PackagingOrderRow[]>([]);
  const [columns, setColumns] = useState<PackagingOrderColumn[]>(PACKAGING_ORDER_COLUMNS);
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const nextRows = await fetchPackagingOrders();
      setRows(nextRows);
    } catch (e: any) {
      setError(e?.message || "포장재구매 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  function handleDownloadExcel() {
    downloadPackagingOrderCsv(rows, columns);
  }

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <PackagingOrderHeader
        loading={loading}
        isColumnEditMode={isColumnEditMode}
        onRefresh={loadRows}
        onDownloadExcel={handleDownloadExcel}
        onToggleColumnEditMode={() => setIsColumnEditMode((prev) => !prev)}
      />

      {error && <div className="text-xs text-red-600">{error}</div>}

      <PackagingOrderGrid
        rows={rows}
        columns={columns}
        isColumnEditMode={isColumnEditMode}
        onRowsChange={setRows}
        onColumnsChange={setColumns}
      />
    </div>
  );
}
