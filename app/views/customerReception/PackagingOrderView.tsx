"use client";

// app/views/customerReception/PackagingOrderView.tsx
//
// 고객접수 > 포장재구매. 카카오 챗봇으로 접수된 포장재구매 요청을 그리드로 보여준다.
// 데이터업로드>반납회수와 같은 그리드 조작(열 이동, 영역지정 복사/삭제)을 제공하되
// "반납요청일 선택해서 통합관리에서 불러오기" 기능은 없다 — payment_orders에서 바로 조회한다.
//
// 추가 기능:
// - "확인" 체크박스로 선택한 행을 "삭제" 버튼(시그니처 블루)으로 일괄 삭제(끝내 입금 안 한 대기 건 정리용)
// - "입금확인" 컬럼 헤더의 ▲▼로 입금확인/입금대기 그룹 정렬(반복 클릭 시 반대로)
// - 열 순서/너비를 grid-settings API에 저장해 새로고침/재방문 후에도 유지

import { useEffect, useMemo, useRef, useState } from "react";
import PackagingOrderHeader from "@/views/customerReception/packaging-order/PackagingOrderHeader";
import PackagingOrderGrid, {
  type PackagingOrderSortMode,
} from "@/views/customerReception/packaging-order/PackagingOrderGrid";
import {
  fetchPackagingOrders,
  deletePackagingOrders,
  fetchPackagingOrderGridSettings,
  savePackagingOrderGridSettings,
  type PackagingOrderGridSettings,
} from "@/views/customerReception/packaging-order/service";
import {
  PACKAGING_ORDER_COLUMNS,
  getPaymentStatusLabel,
  type PackagingOrderColumn,
  type PackagingOrderRow,
} from "@/views/customerReception/packaging-order/columns";

function applyGridSettings(
  baseColumns: PackagingOrderColumn[],
  settings: PackagingOrderGridSettings
): PackagingOrderColumn[] {
  let ordered = baseColumns;

  if (settings.columnOrder.length) {
    const byKey = new Map(baseColumns.map((col) => [col.key, col]));
    const seen = new Set<string>();
    const reordered: PackagingOrderColumn[] = [];

    for (const key of settings.columnOrder) {
      const col = byKey.get(key);
      if (col && !seen.has(key)) {
        reordered.push(col);
        seen.add(key);
      }
    }
    for (const col of baseColumns) {
      if (!seen.has(col.key)) reordered.push(col);
    }
    ordered = reordered;
  }

  return ordered.map((col) => {
    const width = settings.columnWidths[col.key];
    return typeof width === "number" && width > 0 ? { ...col, width } : col;
  });
}

export default function PackagingOrderView() {
  const [rows, setRows] = useState<PackagingOrderRow[]>([]);
  const [columns, setColumns] = useState<PackagingOrderColumn[]>(PACKAGING_ORDER_COLUMNS);
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<PackagingOrderSortMode>("none");

  const saveSettingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const nextRows = await fetchPackagingOrders();
      setRows(nextRows);
      setSelectedIds(new Set());
    } catch (e: any) {
      setError(e?.message || "포장재구매 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();

    (async () => {
      const settings = await fetchPackagingOrderGridSettings();
      if (settings.columnOrder.length || Object.keys(settings.columnWidths).length) {
        setColumns((prev) => applyGridSettings(prev, settings));
      }
    })();
  }, []);

  const sortedRows = useMemo(() => {
    if (sortMode === "none") return rows;

    const withIndex = rows.map((row, index) => ({ row, index }));
    withIndex.sort((a, b) => {
      const aConfirmed = getPaymentStatusLabel(a.row.status) === "입금확인";
      const bConfirmed = getPaymentStatusLabel(b.row.status) === "입금확인";
      if (aConfirmed === bConfirmed) return a.index - b.index;
      if (sortMode === "confirmed-first") return aConfirmed ? -1 : 1;
      return aConfirmed ? 1 : -1;
    });
    return withIndex.map((w) => w.row);
  }, [rows, sortMode]);

  function handleColumnsChange(nextColumns: PackagingOrderColumn[]) {
    setColumns(nextColumns);

    if (saveSettingsTimer.current) clearTimeout(saveSettingsTimer.current);
    saveSettingsTimer.current = setTimeout(() => {
      const columnOrder = nextColumns.map((col) => col.key);
      const columnWidths = Object.fromEntries(nextColumns.map((col) => [col.key, col.width]));
      savePackagingOrderGridSettings(columnOrder, columnWidths);
    }, 400);
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(sortedRows.map((row) => row.id)) : new Set());
  }

  function handleToggleSort() {
    setSortMode((prev) => (prev === "confirmed-first" ? "waiting-first" : "confirmed-first"));
  }

  async function handleDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) return;

    setError("");
    try {
      await deletePackagingOrders(Array.from(selectedIds));
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "삭제하지 못했습니다.");
    }
  }

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <PackagingOrderHeader
        loading={loading}
        isColumnEditMode={isColumnEditMode}
        deleteCount={selectedIds.size}
        onRefresh={loadRows}
        onDelete={handleDelete}
        onToggleColumnEditMode={() => setIsColumnEditMode((prev) => !prev)}
      />

      {error && <div className="text-xs text-red-600">{error}</div>}

      <PackagingOrderGrid
        rows={sortedRows}
        columns={columns}
        isColumnEditMode={isColumnEditMode}
        onRowsChange={setRows}
        onColumnsChange={handleColumnsChange}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        sortMode={sortMode}
        onToggleSort={handleToggleSort}
      />
    </div>
  );
}
