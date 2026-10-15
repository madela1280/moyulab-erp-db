"use client";

import { useEffect, useMemo, useState } from "react";
import LotteShipmentGrid, {
  DEFAULT_LOTTE_SHIPMENT_COLUMNS,
  formatDateTime,
  type LotteShipmentColumn,
} from "@/views/lotteShipment/components/LotteShipmentGrid";
import {
  fetchLotteShipments,
  deleteLotteShipments,
  sendLotteShipmentsToUnified,
  type LotteShipmentRow,
} from "@/views/lotteShipment/service";
import FilterButton from "@/views/lotteShipment/filter/FilterButton";
import {
  applyLotteFilter,
  applyLotteSearch,
  createEmptyFilterState,
  getLotteFilterValueForColumn,
  isFilterActive,
  type ColumnFilterState,
} from "@/views/lotteShipment/filter/useLotteShipmentFilter";

type SortState = { key: keyof LotteShipmentRow; dir: "asc" | "desc" } | null;

export default function LotteShipmentView() {
  const [rows, setRows] = useState<LotteShipmentRow[]>([]);
  const [columns, setColumns] = useState<LotteShipmentColumn[]>(DEFAULT_LOTTE_SHIPMENT_COLUMNS);
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scanSortActive, setScanSortActive] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState(false);
  const [filterState, setFilterState] = useState<ColumnFilterState>(createEmptyFilterState());
  const [sortState, setSortState] = useState<SortState>(null);

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const nextRows = await fetchLotteShipments();
      setRows(nextRows);
      setSelectedIds(new Set());
    } catch (e: any) {
      setError(e?.message || "롯데택배 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  const searchedRows = useMemo(() => applyLotteSearch(rows, searchQuery, formatDateTime), [rows, searchQuery]);
  const filteredRows = useMemo(
    () => applyLotteFilter(searchedRows, filterState, formatDateTime),
    [searchedRows, filterState]
  );

  const displayRows = useMemo(() => {
    // 컬럼 필터 팝오버의 "텍스트 오름차순/내림차순 정렬"이 켜져 있으면 그게 우선.
    if (sortState) {
      const { key, dir } = sortState;
      const sorted = [...filteredRows].sort((a, b) =>
        getLotteFilterValueForColumn(key, a, formatDateTime).localeCompare(
          getLotteFilterValueForColumn(key, b, formatDateTime),
          "ko-KR"
        )
      );
      return dir === "desc" ? sorted.reverse() : sorted;
    }

    if (!scanSortActive) return filteredRows;
    // 스캔일시가 비어있는(미발송) 행을 위로, 그 안에서는 원래 순서 유지
    return [...filteredRows].sort((a, b) => {
      const av = a.스캔일시 ? 1 : 0;
      const bv = b.스캔일시 ? 1 : 0;
      return av - bv;
    });
  }, [filteredRows, scanSortActive, sortState]);

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(rows.map((row) => row.운송장번호)) : new Set());
  }

  async function handleDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) return;

    setError("");
    try {
      await deleteLotteShipments(Array.from(selectedIds));
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "삭제하지 못했습니다.");
    }
  }

  async function handleSend() {
    if (selectedIds.size === 0) return;

    setError("");
    try {
      const result = await sendLotteShipmentsToUnified(Array.from(selectedIds));
      if (result.skippedInvoiceNos.length > 0) {
        window.alert(
          `전송 완료: ${result.sentCount}건\n매칭 실패(건너뜀): ${result.skippedInvoiceNos.length}건\n` +
            `(수취인명+전화번호가 통합관리와 정확히 일치하는 행이 없거나 여러 건인 경우입니다)`
        );
      }
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "전송하지 못했습니다.");
    }
  }

  const unsentSelectedCount = Array.from(selectedIds).filter(
    (id) => rows.find((r) => r.운송장번호 === id)?.전송상태 === "미전송"
  ).length;

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <div className="flex items-center gap-2">
        <div className="text-base font-semibold text-slate-800">롯데택배</div>
        <button
          type="button"
          onClick={() => setSearchOpen((prev) => !prev)}
          className={`px-3 py-1.5 rounded border text-sm ${
            searchOpen ? "border-slate-700 bg-slate-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          검색
        </button>
        {searchOpen && (
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="운송장번호, 수하인명, 전화번호, 주소, 기기번호 등으로 검색"
            className="w-72 px-2 py-1.5 text-sm border border-slate-300 rounded"
          />
        )}
        <FilterButton
          active={filterMode || isFilterActive(filterState)}
          onClick={() => {
            setFilterMode((prev) => {
              const next = !prev;
              if (!next) setFilterState(createEmptyFilterState()); // 필터 버튼 다시 누르면 꺼지면서 필터도 해제
              return next;
            });
          }}
        />
        <div className="flex-1" />
        <button
          type="button"
          onClick={loadRows}
          disabled={loading}
          className="px-3 py-1.5 rounded border border-slate-300 bg-white text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          새로고침
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={selectedIds.size === 0}
          className="px-3 py-1.5 rounded border border-red-300 bg-white text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          삭제 ({selectedIds.size})
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={unsentSelectedCount === 0}
          className="px-3 py-1.5 rounded border border-blue-300 bg-white text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-50"
        >
          전송 ({unsentSelectedCount})
        </button>
        <button
          type="button"
          onClick={() => setIsColumnEditMode((prev) => !prev)}
          className={`px-3 py-1.5 rounded border text-sm ${
            isColumnEditMode ? "border-slate-700 bg-slate-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          열이동
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <LotteShipmentGrid
        rows={displayRows}
        columns={columns}
        isColumnEditMode={isColumnEditMode}
        onColumnsChange={setColumns}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        scanSortActive={scanSortActive}
        onToggleScanSort={() => setScanSortActive((prev) => !prev)}
        filterMode={filterMode}
        filterState={filterState}
        onFilterStateChange={setFilterState}
        allRowsForFilter={searchedRows}
        onSortChange={(key, dir) => setSortState({ key, dir })}
      />
    </div>
  );
}
