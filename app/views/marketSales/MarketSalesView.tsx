"use client";

// app/views/marketSales/MarketSalesView.tsx
//
// 쿠팡/스마트스토어 매출 조회 + 이카운트전송 화면. channel prop으로 쿠팡(제이컴퍼니/한모정)/
// 스마트스토어를 구분한다(화면 자체는 완전히 동일한 양식, 데이터만 채널별로 분리).
// ⚠️ 아직 쿠팡/네이버 API로 매출을 자동으로 가져오는 수집 로직은 없음 — 조회/삭제/이카운트전송만 가능.

import { useEffect, useMemo, useState } from "react";
import MarketSalesGrid from "@/views/marketSales/components/MarketSalesGrid";
import { useMarketSalesColumnConfig } from "@/views/marketSales/column-config/useMarketSalesColumnConfig";
import { fetchMarketSales, deleteMarketSales, sendMarketSalesToEcount } from "@/views/marketSales/service";
import type { MarketSalesChannel, MarketSalesRow } from "@/views/marketSales/types";
import FilterButton from "@/views/lotteShipment/filter/FilterButton";
import {
  applyMarketSalesFilter,
  applyMarketSalesSearch,
  createEmptyFilterState,
  getFilterValueForColumn,
  isFilterActive,
  type ColumnFilterState,
} from "@/views/marketSales/filter/useMarketSalesFilter";

type SortState = { key: keyof MarketSalesRow; dir: "asc" | "desc" } | null;

// ✅ "마켓상품명" 컬럼 라벨만 채널별로 다르게 보여준다(쿠팡은 쿠팡상품명, 네이버는 네이버상품명) —
//    순서/너비 저장은 공통 키("마켓상품명")로 그대로 하고, 화면에 보이는 글자만 바꾼다.
const MARKET_ITEM_NAME_LABEL: Record<MarketSalesChannel, string> = {
  coupang_jcompany: "쿠팡상품명",
  coupang_hanmojeong: "쿠팡상품명",
  smartstore: "네이버상품명",
};

export default function MarketSalesView({ channel, title }: { channel: MarketSalesChannel; title: string }) {
  const [rows, setRows] = useState<MarketSalesRow[]>([]);
  const { columns, setColumns } = useMarketSalesColumnConfig(channel);
  const displayColumns = useMemo(
    () =>
      columns.map((c) =>
        c.key === "마켓상품명" ? { ...c, label: MARKET_ITEM_NAME_LABEL[channel] } : c
      ),
    [columns, channel]
  );
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState(false);
  const [filterState, setFilterState] = useState<ColumnFilterState>(createEmptyFilterState());
  const [sortState, setSortState] = useState<SortState>(null);

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const nextRows = await fetchMarketSales(channel);
      setRows(nextRows);
      setSelectedIds(new Set());
    } catch (e: any) {
      setError(e?.message || "매출 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const searchedRows = useMemo(() => applyMarketSalesSearch(rows, searchQuery), [rows, searchQuery]);
  const filteredRows = useMemo(() => applyMarketSalesFilter(searchedRows, filterState), [searchedRows, filterState]);

  const sortedRows = useMemo(() => {
    if (!sortState) return filteredRows;
    const { key, dir } = sortState;
    const sorted = [...filteredRows].sort((a, b) =>
      getFilterValueForColumn(key, a).localeCompare(getFilterValueForColumn(key, b), "ko-KR")
    );
    return dir === "desc" ? sorted.reverse() : sorted;
  }, [filteredRows, sortState]);

  function handleToggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set());
  }

  async function handleDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) return;

    setError("");
    try {
      await deleteMarketSales(channel, Array.from(selectedIds));
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "삭제하지 못했습니다.");
    }
  }

  async function handleSendEcount() {
    if (selectedIds.size === 0) return;

    setError("");
    try {
      const result = await sendMarketSalesToEcount(channel, Array.from(selectedIds));
      if (result.skippedCount > 0) {
        window.alert(`이카운트 전송 완료: ${result.sentCount}건\n보류(미매핑 등): ${result.skippedCount}건`);
      }
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "이카운트로 전송하지 못했습니다.");
    }
  }

  const unsentEcountSelectedCount = Array.from(selectedIds).filter(
    (id) => rows.find((r) => r.id === id)?.이카운트전송상태 !== "전송완료"
  ).length;

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <div className="flex items-center gap-2">
        <div className="text-base font-semibold text-slate-800">{title}</div>
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
            placeholder="마켓상품명, 품목, 품목명으로 검색"
            className="w-72 px-2 py-1.5 text-sm border border-slate-300 rounded"
          />
        )}
        <FilterButton
          active={filterMode || isFilterActive(filterState)}
          onClick={() => {
            setFilterMode((prev) => {
              const next = !prev;
              if (!next) setFilterState(createEmptyFilterState());
              return next;
            });
          }}
        />
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => loadRows()}
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
          onClick={handleSendEcount}
          disabled={unsentEcountSelectedCount === 0}
          className="px-3 py-1.5 rounded border border-red-600 bg-red-600 text-sm text-black hover:bg-red-700 disabled:opacity-50"
        >
          이카운트 전송 ({unsentEcountSelectedCount})
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

      <MarketSalesGrid
        rows={sortedRows}
        columns={displayColumns}
        isColumnEditMode={isColumnEditMode}
        onColumnsChange={setColumns}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        filterMode={filterMode}
        filterState={filterState}
        onFilterStateChange={setFilterState}
        allRowsForFilter={searchedRows}
        onSortChange={(key, dir) => setSortState({ key, dir })}
      />
    </div>
  );
}
