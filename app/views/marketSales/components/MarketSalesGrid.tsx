"use client";

// app/views/marketSales/components/MarketSalesGrid.tsx
//
// 쿠팡/스마트스토어 매출 조회 표. 읽기 전용(값 입력은 API 자동수집에서만 채워짐) —
// 체크박스로 선택 -> 삭제/이카운트전송만 가능. 롯데택배 그리드와 동일한 열이동/필터 방식.

import { useState } from "react";
import type { MarketSalesRow } from "@/views/marketSales/types";
import ColumnFilterPopover from "@/views/lotteShipment/filter/ColumnFilterPopover";
import {
  getUniqueValuesForColumn,
  type ColumnFilterState,
} from "@/views/marketSales/filter/useMarketSalesFilter";

export type MarketSalesColumn = {
  key: keyof MarketSalesRow;
  label: string;
  width: number;
};

export const DEFAULT_MARKET_SALES_COLUMNS: MarketSalesColumn[] = [
  { key: "일자", label: "일자", width: 100 },
  { key: "마켓상품명", label: "마켓상품명", width: 280 },
  { key: "품목", label: "품목", width: 110 },
  { key: "품목명", label: "품목명", width: 280 },
  { key: "수량", label: "수량", width: 70 },
  { key: "단가", label: "단가", width: 100 },
  { key: "공급가액", label: "공급가액", width: 110 },
  { key: "부가세", label: "부가세", width: 100 },
  { key: "합계", label: "합계", width: 110 },
  { key: "이카운트전송상태", label: "이카운트전송", width: 110 },
];

function normalizeWidth(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.min(2000, Math.max(60, Math.round(value)));
}

function formatNumber(v: number) {
  return Number(v ?? 0).toLocaleString("ko-KR");
}

export default function MarketSalesGrid({
  rows,
  columns,
  isColumnEditMode,
  onColumnsChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  filterMode = false,
  filterState,
  onFilterStateChange,
  allRowsForFilter,
  onSortChange,
}: {
  rows: MarketSalesRow[];
  columns: MarketSalesColumn[];
  isColumnEditMode: boolean;
  onColumnsChange: (columns: MarketSalesColumn[]) => void;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: (checked: boolean) => void;
  filterMode?: boolean;
  filterState?: ColumnFilterState;
  onFilterStateChange?: (next: ColumnFilterState) => void;
  allRowsForFilter?: MarketSalesRow[];
  onSortChange?: (key: keyof MarketSalesRow, dir: "asc" | "desc") => void;
}) {
  const allChecked = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  const [popoverColKey, setPopoverColKey] = useState<string | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
  const [popoverSearch, setPopoverSearch] = useState("");

  const [widthDraft, setWidthDraft] = useState<{ key: string; text: string } | null>(null);

  function widthInputValue(col: MarketSalesColumn) {
    return widthDraft && widthDraft.key === col.key ? widthDraft.text : String(col.width);
  }

  function handleWidthInputChange(col: MarketSalesColumn, value: string) {
    setWidthDraft({ key: col.key, text: value });
    const trimmed = value.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const nextWidth = normalizeWidth(parsed);
    onColumnsChange(columns.map((c) => (c.key === col.key ? { ...c, width: nextWidth } : c)));
  }

  function commitWidthDraft(col: MarketSalesColumn) {
    if (!widthDraft || widthDraft.key !== col.key) return;
    setWidthDraft(null);
  }

  function moveColumn(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= columns.length) return;
    const next = [...columns];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onColumnsChange(next);
  }

  function openFilterPopover(colKey: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverAnchor({ x: rect.left, y: rect.bottom + 4 });
    setPopoverColKey(colKey);
    setPopoverSearch("");
  }

  function closeFilterPopover() {
    setPopoverColKey(null);
    setPopoverAnchor(null);
  }

  const popoverValues = popoverColKey
    ? getUniqueValuesForColumn(allRowsForFilter ?? rows, popoverColKey as keyof MarketSalesRow)
    : [];
  const popoverSelected = (popoverColKey && filterState?.selectedByKey[popoverColKey]) || new Set<string>();

  function toggleFilterValue(value: string) {
    if (!popoverColKey || !onFilterStateChange || !filterState) return;
    const prev = filterState.selectedByKey[popoverColKey] ?? new Set<string>();
    const next = new Set(prev);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onFilterStateChange({
      ...filterState,
      selectedByKey: { ...filterState.selectedByKey, [popoverColKey]: next },
    });
  }

  function setFilterAll(values: string[]) {
    if (!popoverColKey || !onFilterStateChange || !filterState) return;
    onFilterStateChange({
      ...filterState,
      selectedByKey: { ...filterState.selectedByKey, [popoverColKey]: new Set(values) },
    });
  }

  function clearFilterColumn() {
    if (!popoverColKey || !onFilterStateChange || !filterState) return;
    const next = { ...filterState.selectedByKey };
    delete next[popoverColKey];
    onFilterStateChange({ ...filterState, selectedByKey: next });
  }

  const columnHasFilter = (colKey: string) => !!filterState?.selectedByKey[colKey]?.size;

  function sortAsc() {
    if (!popoverColKey || !onSortChange) return;
    onSortChange(popoverColKey as keyof MarketSalesRow, "asc");
    closeFilterPopover();
  }

  function sortDesc() {
    if (!popoverColKey || !onSortChange) return;
    onSortChange(popoverColKey as keyof MarketSalesRow, "desc");
    closeFilterPopover();
  }

  const checkboxColWidth = 40;
  const tableWidth = checkboxColWidth + columns.reduce((sum, c) => sum + c.width, 0);
  const numericKeys: (keyof MarketSalesRow)[] = ["수량", "단가", "공급가액", "부가세", "합계"];

  return (
    <div className="flex-1 min-h-0 rounded border border-slate-300 bg-white overflow-auto">
      <table
        className="border-collapse text-xs text-slate-900 font-normal"
        style={{ tableLayout: "fixed", width: tableWidth }}
      >
        <colgroup>
          <col style={{ width: checkboxColWidth }} />
          {columns.map((col) => (
            <col key={col.key} style={{ width: col.width }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10">
          <tr>
            <th
              className="select-none border border-slate-400 px-2 py-2 text-center font-semibold text-white"
              style={{ width: 40, minWidth: 40, backgroundColor: "#7030a0" }}
            >
              <input type="checkbox" checked={allChecked} onChange={(e) => onToggleSelectAll(e.target.checked)} title="전체 선택" />
            </th>

            {columns.map((col, index) => (
              <th
                key={col.key}
                className="select-none border border-slate-400 px-2 py-2 text-center font-semibold text-white whitespace-nowrap"
                style={{ width: col.width, minWidth: col.width, backgroundColor: "#7030a0" }}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="inline-flex items-center gap-1">
                    <span className={col.key === "이카운트전송상태" ? "text-red-300" : ""}>{col.label}</span>
                    {filterMode && (
                      <button
                        type="button"
                        title="필터"
                        className={`text-[10px] leading-none ${
                          columnHasFilter(col.key) ? "text-yellow-300" : "text-white/70 hover:text-white"
                        }`}
                        onClick={(e) => openFilterPopover(col.key, e)}
                      >
                        ▼
                      </button>
                    )}
                  </span>

                  {isColumnEditMode && (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-600 disabled:opacity-30"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            moveColumn(index, -1);
                          }}
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-600 disabled:opacity-30"
                          disabled={index === columns.length - 1}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            moveColumn(index, 1);
                          }}
                        >
                          →
                        </button>
                      </div>
                      <input
                        className="h-6 w-14 rounded border border-slate-200 bg-white px-1 text-center text-[11px] text-slate-700"
                        type="number"
                        min={60}
                        max={2000}
                        value={widthInputValue(col)}
                        onChange={(e) => handleWidthInputChange(col, e.target.value)}
                        onBlur={() => commitWidthDraft(col)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitWidthDraft(col);
                          }
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="odd:bg-white even:bg-slate-50">
              <td className="border border-slate-300 px-2 py-1 text-center">
                <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => onToggleSelect(row.id)} />
              </td>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`border border-slate-300 px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis ${
                    numericKeys.includes(col.key) ? "text-right" : ""
                  }`}
                >
                  {col.key === "이카운트전송상태" ? (
                    <span
                      className={
                        row.이카운트전송상태 === "전송완료"
                          ? "text-emerald-700 font-semibold"
                          : row.이카운트전송상태 === "미매핑"
                          ? "text-orange-600 font-semibold"
                          : "text-slate-400"
                      }
                    >
                      {row.이카운트전송상태}
                    </span>
                  ) : numericKeys.includes(col.key) ? (
                    formatNumber(row[col.key] as number)
                  ) : (
                    String(row[col.key] ?? "")
                  )}
                </td>
              ))}
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="px-2 py-8 text-center text-slate-400">
                데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <ColumnFilterPopover
        open={!!popoverColKey}
        anchor={popoverAnchor}
        columnKey={popoverColKey}
        values={popoverValues}
        selected={popoverSelected}
        search={popoverSearch}
        onClose={closeFilterPopover}
        onSearchChange={setPopoverSearch}
        onToggleValue={toggleFilterValue}
        onSelectAll={setFilterAll}
        onClear={clearFilterColumn}
        onSortAsc={sortAsc}
        onSortDesc={sortDesc}
      />
    </div>
  );
}
