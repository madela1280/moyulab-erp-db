"use client";

// app/views/lotteShipment/components/LotteShipmentGrid.tsx
//
// 롯데택배 조회 화면 표. 체크박스로 선택 -> 삭제/전송, 스캔일시 옆 ▽로 미스캔(발송 안 됨) 건을
// 위로 정렬. 열이동 모드에서는 컬럼 너비 조절 + 좌우 이동이 가능하다(환불접수 그리드와 동일 방식).
// 모든 칸은 읽기 전용(값 입력은 스캔 연동에서만 채워짐).

import { useState } from "react";
import type { LotteShipmentRow } from "@/views/lotteShipment/service";
import ColumnFilterPopover from "@/views/lotteShipment/filter/ColumnFilterPopover";
import {
  getUniqueValuesForColumn,
  type ColumnFilterState,
} from "@/views/lotteShipment/filter/useLotteShipmentFilter";

export type LotteShipmentColumn = {
  key: keyof LotteShipmentRow;
  label: string;
  width: number;
};

export const DEFAULT_LOTTE_SHIPMENT_COLUMNS: LotteShipmentColumn[] = [
  { key: "집하일자", label: "집하일자", width: 100 },
  { key: "운송장번호", label: "운송장번호", width: 140 },
  { key: "주문번호", label: "주문번호", width: 160 },
  { key: "수하인명", label: "수하인명", width: 90 },
  { key: "수하인전화번호", label: "전화번호", width: 130 },
  { key: "수하인주소", label: "주소", width: 260 },
  { key: "기기번호", label: "기기번호", width: 110 },
  { key: "스캔일시", label: "스캔일시(출고일자)", width: 150 },
  { key: "전송상태", label: "통합관리 전송상태", width: 110 },
  { key: "이카운트전송상태", label: "이카운트 전송", width: 130 },
  { key: "상품명", label: "상품명", width: 260 },
];

function normalizeWidth(value: number) {
  if (!Number.isFinite(value)) return 100;
  return Math.min(800, Math.max(60, Math.round(value)));
}

export function formatDateTime(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LotteShipmentGrid({
  rows,
  columns,
  isColumnEditMode,
  onColumnsChange,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  scanSortActive,
  onToggleScanSort,
  filterMode = false,
  filterState,
  onFilterStateChange,
  allRowsForFilter,
  onSortChange,
  onUpdateProductName,
  onUpdateDeviceNo,
}: {
  rows: LotteShipmentRow[];
  columns: LotteShipmentColumn[];
  isColumnEditMode: boolean;
  onColumnsChange: (columns: LotteShipmentColumn[]) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
  scanSortActive: boolean;
  onToggleScanSort: () => void;
  filterMode?: boolean;
  filterState?: ColumnFilterState;
  onFilterStateChange?: (next: ColumnFilterState) => void;
  allRowsForFilter?: LotteShipmentRow[];
  onSortChange?: (key: keyof LotteShipmentRow, dir: "asc" | "desc") => void;
  // ✅ 상품명 수정(이카운트 매칭 실패 건을 수동으로 고쳐서 재전송할 수 있게). 전송완료 건은 수정 불가.
  onUpdateProductName?: (invoiceNo: string, newValue: string) => void;
  // ✅ 기기번호 수정(RFID 오인식 등 보정용). 전송 상태와 무관하게 항상 허용.
  onUpdateDeviceNo?: (invoiceNo: string, newValue: string) => void;
}) {
  const allChecked = rows.length > 0 && rows.every((row) => selectedIds.has(row.운송장번호));

  const [popoverColKey, setPopoverColKey] = useState<string | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
  const [popoverSearch, setPopoverSearch] = useState("");

  type EditableField = "상품명" | "기기번호";
  const [editingCell, setEditingCell] = useState<{ invoiceNo: string; field: EditableField } | null>(null);
  const [editingValue, setEditingValue] = useState("");

  function canEditCell(row: LotteShipmentRow, field: EditableField) {
    if (field === "상품명") return row.이카운트전송상태 !== "전송완료"; // 이미 이카운트 전송된 건은 수정 불가
    return true; // 기기번호는 전송 상태와 무관하게 항상 수정 가능
  }

  function startEditCell(row: LotteShipmentRow, field: EditableField) {
    if (!canEditCell(row, field)) return;
    setEditingCell({ invoiceNo: row.운송장번호, field });
    setEditingValue(String(row[field] ?? ""));
  }

  function commitEditCell() {
    if (editingCell) {
      if (editingCell.field === "상품명") onUpdateProductName?.(editingCell.invoiceNo, editingValue);
      else onUpdateDeviceNo?.(editingCell.invoiceNo, editingValue);
    }
    setEditingCell(null);
  }

  // ✅ 열 너비 입력칸: 입력한 글자 자체는 그대로 보여주면서(widthDraft), 유효한 숫자가 될 때마다
  //    즉시 반영해서 표가 바로바로 미세조절되게 한다(기존 방식과 동일한 느낌). 다만 필드가
  //    잠시 비었을 때는(숫자를 지우는 중) 60으로 강제 clamp하지 않고 직전 값을 그대로 유지한다
  //    — 그래야 숫자를 지우고 새로 입력할 때 "60"에 이어붙어 엉뚱한 값에 고정되는 문제가 없다.
  const [widthDraft, setWidthDraft] = useState<{ key: string; text: string } | null>(null);

  function widthInputValue(col: LotteShipmentColumn) {
    return widthDraft && widthDraft.key === col.key ? widthDraft.text : String(col.width);
  }

  function handleWidthInputChange(col: LotteShipmentColumn, value: string) {
    setWidthDraft({ key: col.key, text: value });
    const trimmed = value.trim();
    if (!trimmed) return; // 비어있는 동안은 직전 폭을 그대로 유지(강제 clamp 안 함)
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const nextWidth = normalizeWidth(parsed);
    onColumnsChange(columns.map((c) => (c.key === col.key ? { ...c, width: nextWidth } : c)));
  }

  function commitWidthDraft(col: LotteShipmentColumn) {
    if (!widthDraft || widthDraft.key !== col.key) return;
    setWidthDraft(null); // col.width는 이미 handleWidthInputChange에서 실시간 반영됨 — draft만 정리
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
    ? getUniqueValuesForColumn(allRowsForFilter ?? rows, popoverColKey as keyof LotteShipmentRow, formatDateTime)
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
    onSortChange(popoverColKey as keyof LotteShipmentRow, "asc");
    closeFilterPopover();
  }

  function sortDesc() {
    if (!popoverColKey || !onSortChange) return;
    onSortChange(popoverColKey as keyof LotteShipmentRow, "desc");
    closeFilterPopover();
  }

  // ✅ table-layout:fixed의 열 너비는 <col>이 있으면 그걸 기준으로 고정된다(통합관리 그리드와 동일 방식).
  //    <th>에만 width를 주던 기존 방식은 헤더 편집모드의 버튼/입력칸 때문에 일부 열(수하인명, 주소)이
  //    지정한 너비대로 줄어들지 않는 문제가 있었다 — <col>을 추가해서 해결.
  const checkboxColWidth = 40;
  const tableWidth = checkboxColWidth + columns.reduce((sum, c) => sum + c.width, 0);

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
                    <span
                      className={
                        col.key === "전송상태"
                          ? "text-blue-300"
                          : col.key === "이카운트전송상태"
                          ? "text-red-300"
                          : ""
                      }
                    >
                      {col.label}
                    </span>
                    {col.key === "스캔일시" && (
                      <button
                        type="button"
                        title={scanSortActive ? "수집순으로 되돌리기" : "미스캔(미발송) 건 위로 정렬"}
                        className={`text-[10px] leading-none ${scanSortActive ? "text-yellow-300" : "text-white/70 hover:text-white"}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onToggleScanSort();
                        }}
                      >
                        ▽
                      </button>
                    )}
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
                        max={800}
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
            <tr key={row.운송장번호} className="odd:bg-white even:bg-slate-50">
              <td className="border border-slate-300 px-2 py-1 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.has(row.운송장번호)}
                  onChange={() => onToggleSelect(row.운송장번호)}
                />
              </td>
              {columns.map((col) => {
                const isEditableField = col.key === "상품명" || col.key === "기기번호";
                const isEditingThisCell =
                  isEditableField && editingCell?.invoiceNo === row.운송장번호 && editingCell.field === col.key;
                const editable = isEditableField && canEditCell(row, col.key as EditableField);

                return (
                  <td
                    key={col.key}
                    className="border border-slate-300 px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis"
                    // ✅ span이 아니라 td에 둬야 값이 빈 문자열이라 span의 면적이 0이 되는 경우에도
                    //    더블클릭으로 다시 편집 진입할 수 있다.
                    onDoubleClick={
                      isEditableField && !isEditingThisCell ? () => startEditCell(row, col.key as EditableField) : undefined
                    }
                  >
                    {col.key === "스캔일시"
                      ? formatDateTime(row[col.key] as string | null)
                      : col.key === "집하일자"
                      ? row.집하일자 ?? ""
                      : col.key === "전송상태"
                      ? (
                        <span className={row.전송상태 === "전송완료" ? "text-emerald-700 font-semibold" : "text-slate-400"}>
                          {row.전송상태}
                        </span>
                      )
                      : col.key === "이카운트전송상태"
                      ? (
                        <span className={row.이카운트전송상태 === "전송완료" ? "text-emerald-700 font-semibold" : "text-red-600"}>
                          {row.이카운트전송상태}
                        </span>
                      )
                      : isEditingThisCell
                      ? (
                        <input
                          autoFocus
                          className="w-full h-6 px-1 text-xs border border-blue-400 rounded"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={commitEditCell}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitEditCell();
                            } else if (e.key === "Escape") {
                              setEditingCell(null);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )
                      : isEditableField
                      ? (
                        <span
                          title={editable ? `더블클릭해서 ${col.label} 수정` : ""}
                          className={editable ? "cursor-text hover:bg-yellow-50" : ""}
                        >
                          {String(row[col.key] ?? "")}
                        </span>
                      )
                      : String(row[col.key] ?? "")}
                  </td>
                );
              })}
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
