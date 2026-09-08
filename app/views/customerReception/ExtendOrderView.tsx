"use client";

// app/views/customerReception/ExtendOrderView.tsx
//
// 고객접수 > 연장·연체료. 카카오 챗봇으로 접수된 연장/연체료 정산 요청을 그리드로 보여준다.
// PackagingOrderView.tsx와 같은 그리드 조작(열 이동, 영역지정 복사/삭제)을 제공한다.
// (기존 "입금확인" 화면은 그대로 두고, 여기는 연장·연체료 전용으로 새로 분리한 화면이다.)
//
// 추가 기능:
// - "확인" 체크박스로 선택한 행을 "삭제" 버튼(시그니처 블루)으로 일괄 삭제(끝내 입금 안 한 대기 건 정리용)
// - "입금확인" 컬럼 헤더의 ▲▼로 입금확정/확인필요/입금대기 그룹 정렬(반복 클릭 시 반대로)
// - 열 순서/너비를 grid-settings API에 저장해 새로고침/재방문 후에도 유지

import { useEffect, useMemo, useRef, useState } from "react";
import ExtendOrderHeader from "@/views/customerReception/extend-order/ExtendOrderHeader";
import ExtendOrderGrid, {
  type ExtendOrderSortMode,
} from "@/views/customerReception/extend-order/ExtendOrderGrid";
import {
  fetchExtendOrders,
  deleteExtendOrders,
  fetchExtendOrderGridSettings,
  saveExtendOrderGridSettings,
  type ExtendOrderGridSettings,
} from "@/views/customerReception/extend-order/service";
import {
  EXTEND_ORDER_COLUMNS,
  getPaymentStatusLabel,
  type ExtendOrderColumn,
  type ExtendOrderRow,
} from "@/views/customerReception/extend-order/columns";

function applyGridSettings(
  baseColumns: ExtendOrderColumn[],
  settings: ExtendOrderGridSettings
): ExtendOrderColumn[] {
  let ordered = baseColumns;

  if (settings.columnOrder.length) {
    const byKey = new Map(baseColumns.map((col) => [col.key, col]));
    const seen = new Set<string>();
    const reordered: ExtendOrderColumn[] = [];

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

export default function ExtendOrderView() {
  const [rows, setRows] = useState<ExtendOrderRow[]>([]);
  const [columns, setColumns] = useState<ExtendOrderColumn[]>(EXTEND_ORDER_COLUMNS);
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<ExtendOrderSortMode>("none");

  const saveSettingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const nextRows = await fetchExtendOrders();
      setRows(nextRows);
      setSelectedIds(new Set());
    } catch (e: any) {
      setError(e?.message || "연장·연체료 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();

    (async () => {
      const settings = await fetchExtendOrderGridSettings();
      if (settings.columnOrder.length || Object.keys(settings.columnWidths).length) {
        setColumns((prev) => applyGridSettings(prev, settings));
      }
    })();
  }, []);

  // 카톡으로 새 접수가 들어오거나 SMS로 입금상태가 바뀌어도 새로고침 없이 화면에 반영되도록 주기적으로 갱신.
  // (통합관리처럼 소켓 실시간은 아니지만, 8초마다 조용히 다시 불러와서 사실상 실시간처럼 보이게 한다.)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const nextRows = await fetchExtendOrders();
        setRows(nextRows);
        setSelectedIds((prev) => {
          const stillExists = new Set(nextRows.map((r) => r.id));
          return new Set(Array.from(prev).filter((id) => stillExists.has(id)));
        });
      } catch {
        // 폴링 실패는 조용히 무시 — 다음 주기에 다시 시도
      }
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  // 정렬 우선순위: 입금확정(처리 다 끝난 건) 먼저 → 확인필요(직원이 봐야 하는 건) → 입금대기
  const STATUS_SORT_RANK: Record<string, number> = { 입금확정: 0, 확인필요: 1, 입금대기: 2 };

  const sortedRows = useMemo(() => {
    if (sortMode === "none") return rows;

    const withIndex = rows.map((row, index) => ({ row, index }));
    withIndex.sort((a, b) => {
      const aRank = STATUS_SORT_RANK[getPaymentStatusLabel(a.row.status)] ?? 3;
      const bRank = STATUS_SORT_RANK[getPaymentStatusLabel(b.row.status)] ?? 3;
      if (aRank === bRank) return a.index - b.index;
      const diff = aRank - bRank;
      return sortMode === "confirmed-first" ? diff : -diff;
    });
    return withIndex.map((w) => w.row);
  }, [rows, sortMode]);

  function handleColumnsChange(nextColumns: ExtendOrderColumn[]) {
    setColumns(nextColumns);

    if (saveSettingsTimer.current) clearTimeout(saveSettingsTimer.current);
    saveSettingsTimer.current = setTimeout(() => {
      const columnOrder = nextColumns.map((col) => col.key);
      const columnWidths = Object.fromEntries(nextColumns.map((col) => [col.key, col.width]));
      saveExtendOrderGridSettings(columnOrder, columnWidths);
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
      await deleteExtendOrders(Array.from(selectedIds));
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "삭제하지 못했습니다.");
    }
  }

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <ExtendOrderHeader
        loading={loading}
        isColumnEditMode={isColumnEditMode}
        deleteCount={selectedIds.size}
        onRefresh={loadRows}
        onDelete={handleDelete}
        onToggleColumnEditMode={() => setIsColumnEditMode((prev) => !prev)}
      />

      {error && <div className="text-xs text-red-600">{error}</div>}

      <ExtendOrderGrid
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
