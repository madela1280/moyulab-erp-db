"use client";

import type React from "react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { acquireLock, releaseLock } from "@/global-lock/lock-engine";

import { symphonyColumns } from "@/devices/symphony/columns/symphonyColumns";
import { useSymphonyRows } from "@/devices/symphony/hooks/useSymphonyRows";
import {
  bulkDeleteSymphony,
  bulkPatchSymphony,
  insertSymphonyRows,
  patchSymphonyRow,
  type SymphonyRow,
} from "@/devices/symphony/service/serviceSymphony";

import ColumnFilterPopover from "@/devices/symphony/filter/ColumnFilterPopover";
import {
  applySymphonyFilter,
  getUniqueValuesForColumn,
  isFilterActive,
  type ColumnFilterState,
} from "@/devices/symphony/filter/useSymphonyFilter";
import {
  applySymphonySort,
  type SymphonySortState,
} from "@/devices/symphony/filter/useSymphonySort";

import { useUnifiedRentalStatus } from "@/devices/symphony/derived/useUnifiedRentalStatus";

import { buildColorBulkPatch } from "@/devices/symphony/color/applySymphonyColor";
import type { SymphonySoftColor } from "@/devices/symphony/color/ColorPopover";

export type SymphonyGridHandle = {
  // ✅ 실시간 수신 시 점멸 줄이기 위해 silent reload 옵션 지원
  reload: (options?: { silent?: boolean }) => Promise<void>;
  applyColorToSelection: (
    color: SymphonySoftColor,
    mode: "text" | "cell"
  ) => Promise<void>;
};

type Props = {
  isColumnEditMode?: boolean;

  columnOrder?: string[];
  onColumnOrderChange?: (next: string[]) => void;

  colWidthUnitByKey?: Record<string, number>;
  onColWidthUnitByKeyChange?: (next: Record<string, number>) => void;

  // 필터/정렬
  filterMode: boolean;
  filterState: ColumnFilterState;
  onFilterStateChange: (next: ColumnFilterState) => void;

  sortState: SymphonySortState;
  onSortStateChange: (next: SymphonySortState) => void;
};

function clampUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function isComputedColumn(key: string) {
  return key === "수리횟수" || key === "거래처" || key === "대여자명";
}

function normalizeDeviceNo(v: any) {
  return String(v ?? "").trim();
}

function stripRentingMarker(v: any) {
  const raw = String(v ?? "");
  if (!raw) return "";

  // "대여중" 표기(예: "대여중", " (대여중)", "(대여중)")만 제거해서 안정화
  let s = raw;
  s = s.replace(/\(대여중\)/g, "");
  s = s.replace(/\s*대여중\s*/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function calcRepairCount(data: Record<string, any>) {
  const keys = ["수리이력1", "수리이력2", "수리이력3", "수리이력4", "수리이력5"];
  let c = 0;
  for (const k of keys) {
    const v = String(data?.[k] ?? "").trim();
    if (v) c++;
  }
  return c;
}

function formatWon(v: any) {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return raw; // 숫자 아니면 원본 유지
  return n.toLocaleString("ko-KR");
}

type CellStyleInfo = { bg?: string; fg?: string };

function cellStyleKey(rowId: number, colKey: string) {
  return `${rowId}:${colKey}`;
}

// ✅ Tailwind class가 생성/적용 안 되는 환경에서도 100% 동작하도록 inline color로 렌더링
const INLINE_PALETTE: Record<string, { bg: string; text: string }> = {
  red: { bg: "#FECACA", text: "#991B1B" }, // red-200 / red-800
  yellow: { bg: "#FEF08A", text: "#854D0E" }, // yellow-200 / yellow-800
  blue: { bg: "#BFDBFE", text: "#1E40AF" }, // blue-200 / blue-800
  green: { bg: "#BBF7D0", text: "#166534" }, // green-200 / green-800
  purple: { bg: "#E9D5FF", text: "#6B21A8" }, // purple-200 / purple-800
  black: { bg: "#CBD5E1", text: "#0F172A" }, // slate-300 / slate-900
};

function getCellStyleInfo(
  rowData: Record<string, any>,
  rowId: number,
  colKey: string
): CellStyleInfo {
  const map = (rowData?.__cellStyle ?? {}) as Record<string, CellStyleInfo>;
  return map[cellStyleKey(rowId, colKey)] ?? {};
}

// ✅ Excel 클립보드 TSV 파서(따옴표 처리 + 셀 내부 줄바꿈 유지)
// - 탭(\t): 컬럼 구분
// - 개행(\n): 행 구분(단, 따옴표 내부 개행은 셀 값으로 유지)
// - 따옴표("..."): 셀 감싸기, 내부 따옴표는 "" 로 escape 되는 형태 지원
function parseExcelClipboardTSV(text: string): string[][] {
  const s = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
      // 따옴표 내부에서 "" -> " 로 처리
      if (inQuotes && s[i + 1] === '"') {
        cell += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === "\t") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  // 마지막 셀/행 flush
  row.push(cell);
  rows.push(row);

  // Excel/구글시트는 끝에 개행이 붙는 경우가 많아서 "마지막 1개"만 제거(기존 parseTSV 정책 유지)
  if (rows.length > 1) {
    const last = rows[rows.length - 1];
    const lastAllEmpty = last.every((v) => String(v ?? "") === "");
    if (lastAllEmpty) rows.pop();
  }

  return rows.length ? rows : [[""]];
}

// ✅ 옵션: 셀 내부 줄바꿈(Alt+Enter)을 공백으로 치환해서 저장할지
// - true: "insert card\nerror" -> "insert card error"
// - false: 줄바꿈을 그대로 유지
const PASTE_REPLACE_CELL_NEWLINES_WITH_SPACE = true;

const SymphonyGrid = forwardRef<SymphonyGridHandle, Props>(function SymphonyGrid(props, ref) {
  const { rows, setRows, setTotalCount, baseIndex, loading, error, reload } =
    useSymphonyRows();

  const { rentingDeviceNoSet, rentingInfoByDeviceNo } = useUnifiedRentalStatus();

  const isColumnEditMode = !!props.isColumnEditMode;

  const [columnOrderState, setColumnOrderState] = useState<string[]>(() => [
    ...symphonyColumns,
  ]);
  const [colWidthUnitByKeyState, setColWidthUnitByKeyState] = useState<Record<
    string,
    number
  >>({});

  const columnOrder = props.columnOrder ?? columnOrderState;
  const colWidthUnitByKey = props.colWidthUnitByKey ?? colWidthUnitByKeyState;

  function setColumnOrderNext(updater: (prev: string[]) => string[]) {
    if (props.onColumnOrderChange) props.onColumnOrderChange(updater(columnOrder));
    else setColumnOrderState(updater);
  }

  function setColWidthUnitByKeyNext(
    updater: (prev: Record<string, number>) => Record<string, number>
  ) {
    if (props.onColWidthUnitByKeyChange)
      props.onColWidthUnitByKeyChange(updater(colWidthUnitByKey));
    else setColWidthUnitByKeyState(updater(colWidthUnitByKey));
  }

  const viewColumns = useMemo(() => columnOrder, [columnOrder]);

  function moveColLeft(key: string) {
    setColumnOrderNext((prev) => {
      const i = prev.indexOf(key);
      if (i <= 0) return prev;
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  function moveColRight(key: string) {
    setColumnOrderNext((prev) => {
      const i = prev.indexOf(key);
      if (i < 0 || i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }

  function setWidthUnit(key: string, unit: number) {
    const safe = Number.isFinite(unit)
      ? Math.max(1, Math.min(200, Math.floor(unit)))
      : 20;
    setColWidthUnitByKeyNext((prev) => ({ ...prev, [key]: safe }));
  }

  function getWidthPx(key: string) {
    const unit = clampUnit(colWidthUnitByKey?.[key] ?? 20);
    const BASE = 140;
    const MIN = 60;
    const MAX = 560;
    const px = Math.round((BASE * unit) / 20);
    return Math.max(MIN, Math.min(MAX, px));
  }

  // ===== 필터/정렬 적용된 표시 rows =====
  const displayRows = useMemo(() => {
    const filtered = applySymphonyFilter(rows, props.filterState);
    const sorted = applySymphonySort(filtered, props.sortState);
    return sorted;
  }, [rows, props.filterState, props.sortState]);

  // ===== 선택(행/셀) =====
  const [selectedRowRange, setSelectedRowRange] = useState<{ start: number; end: number } | null>(
    null
  );
  const [selectedCellRange, setSelectedCellRange] = useState<{
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
  } | null>(null);

  const [isRowDragging, setIsRowDragging] = useState(false);
  const [rowDragAnchor, setRowDragAnchor] = useState<number | null>(null);

  const [isCellDragging, setIsCellDragging] = useState(false);
  const [cellDragAnchor, setCellDragAnchor] = useState<{ row: number; col: number } | null>(null);

  function isRowSelected(rowIndex: number) {
    if (!selectedRowRange) return false;
    return rowIndex >= selectedRowRange.start && rowIndex <= selectedRowRange.end;
  }

  function setCellRangeByPoints(r1: number, c1: number, r2: number, c2: number) {
    const startRow = Math.max(0, Math.min(r1, r2));
    const endRow = Math.min(displayRows.length - 1, Math.max(r1, r2));
    const startCol = Math.max(0, Math.min(c1, c2));
    const endCol = Math.min(viewColumns.length - 1, Math.max(c1, c2));
    setSelectedCellRange({ startRow, endRow, startCol, endCol });
  }

  function isCellSelected(rowIndex: number, colIndex: number) {
    if (!selectedCellRange) return false;
    const { startRow, endRow, startCol, endCol } = selectedCellRange;
    return rowIndex >= startRow && rowIndex <= endRow && colIndex >= startCol && colIndex <= endCol;
  }

  function getSelectedRowSlice() {
    if (!selectedRowRange) return { start: 0, end: -1, slice: [] as SymphonyRow[] };
    const start = Math.max(0, selectedRowRange.start);
    const end = Math.min(displayRows.length - 1, selectedRowRange.end);
    return { start, end, slice: displayRows.slice(start, end + 1) };
  }

  // ===== 컨텍스트 메뉴 =====
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuMode, setContextMenuMode] = useState<"row" | "cell">("row");

  // ===== 필터 팝오버 =====
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [filterPopoverAnchor, setFilterPopoverAnchor] = useState<{ x: number; y: number } | null>(
    null
  );
  const [filterColumnKey, setFilterColumnKey] = useState<string | null>(null);

  const filterValues = useMemo(() => {
    if (!filterColumnKey) return [];
    return getUniqueValuesForColumn(rows, filterColumnKey);
  }, [rows, filterColumnKey]);

  const filterSelectedSet = useMemo(() => {
    if (!filterColumnKey) return new Set<string>();
    return props.filterState.selectedByKey[filterColumnKey] ?? new Set<string>();
  }, [props.filterState.selectedByKey, filterColumnKey]);

  const filterSearch = useMemo(() => {
    if (!filterColumnKey) return "";
    return props.filterState.searchByKey[filterColumnKey] ?? "";
  }, [props.filterState.searchByKey, filterColumnKey]);

  function closeFilterPopover() {
    setFilterPopoverOpen(false);
    setFilterPopoverAnchor(null);
    setFilterColumnKey(null);
  }

  // ===== 편집(락) =====
  const [myRowLocks, setMyRowLocks] = useState<Record<number, boolean>>({});
  const editingCellRef = useRef<{ rowId: number; key: string } | null>(null);

  const [activeEditCell, setActiveEditCell] = useState<{ rowId: number; key: string } | null>(null);
  const [activeEditValue, setActiveEditValue] = useState<string>("");

  async function handleFocus(rowId: number, key: string, initialValue: string, e: any) {
    if (isComputedColumn(key)) {
      e.target.blur();
      return;
    }

    editingCellRef.current = { rowId, key };
    setActiveEditCell({ rowId, key });
    setActiveEditValue(initialValue ?? "");

    const result = await acquireLock("symphony", rowId);

    const stillActive =
      editingCellRef.current?.rowId === rowId && editingCellRef.current?.key === key;

    if (!stillActive) {
      if (result.ok) await releaseLock("symphony", rowId);
      return;
    }

    if (result.ok) {
      setMyRowLocks((prev) => ({ ...prev, [rowId]: true }));
      return;
    }

    editingCellRef.current = null;
    setActiveEditCell(null);
    setActiveEditValue("");
    alert("이 행을 편집할 수 없습니다. (다른 사용자가 편집 중이거나 권한이 없습니다)");
    e.target.blur();
  }

  function updateLocalCell(rowId: number, key: string, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, data: { ...r.data, [key]: value } } : r))
    );
  }

  async function saveCell(rowId: number, key: string, value: string) {
    const v = value === "" ? null : value;
    await patchSymphonyRow(rowId, { [key]: v });
  }

  // ===== 유틸: 셀 표시값(파생 포함) =====
  function getDisplayValue(row: SymphonyRow, colKey: string) {
    const deviceNo = normalizeDeviceNo(row.data?.["시스템 기기번호"]);
    const renting = !!deviceNo && rentingDeviceNoSet.has(deviceNo);
    const rentalInfo = deviceNo ? rentingInfoByDeviceNo?.[deviceNo] : undefined;

    if (colKey === "수리횟수") return String(calcRepairCount(row.data));

    // ✅ 대여중 표시(안정화: 비대여중일 때 "대여중" 문구는 항상 제거)
    if (colKey === "유축기 위치") {
      const raw0 = String(row.data?.[colKey] ?? "");
      const raw = stripRentingMarker(raw0);

      if (!renting) return raw;
      return raw ? `${raw} (대여중)` : "대여중";
    }

    // ✅ 거래처/대여자명 자동 반영(대여중일 때만)
    if (colKey === "거래처") {
      if (renting) return String(rentalInfo?.거래처분류 ?? "");
      return String(row.data?.[colKey] ?? "");
    }

    if (colKey === "대여자명") {
      if (renting) return String(rentalInfo?.수취인명 ?? "");
      return String(row.data?.[colKey] ?? "");
    }

    if (colKey === "원가") {
      return formatWon(row.data?.[colKey]);
    }

    return String(row.data?.[colKey] ?? "");
  }

  // ===== 키보드 이동 =====
  function focusCell(rowIndex: number, colIndex: number) {
    const input = document.querySelector<HTMLInputElement>(
      `input[data-row="${rowIndex}"][data-col="${colIndex}"]`
    );
    if (input) {
      input.focus();
      input.select();
      return true;
    }

    // ✅ computed 컬럼(거래처/대여자명/수리횟수)은 input이 없으므로 td에 포커스
    const td = document.querySelector<HTMLElement>(`td[data-row="${rowIndex}"][data-col="${colIndex}"]`);
    if (td) {
      td.focus();
      return true;
    }

    return false;
  }

  function handleCellKeyDown(e: React.KeyboardEvent<HTMLElement>, rowIndex: number, colIndex: number) {
    let r = rowIndex;
    let c = colIndex;

    switch (e.key) {
      case "ArrowDown":
        if (rowIndex < displayRows.length - 1) r = rowIndex + 1;
        else return;
        break;
      case "ArrowUp":
        if (rowIndex > 0) r = rowIndex - 1;
        else return;
        break;
      case "ArrowRight":
        if (colIndex < viewColumns.length - 1) c = colIndex + 1;
        else return;
        break;
      case "ArrowLeft":
        if (colIndex > 0) c = colIndex - 1;
        else return;
        break;
      default:
        return;
    }

    // ✅ 방향키 이동 = 선택(파란 표시)도 함께 이동
    setSelectedRowRange(null);
    setSelectedCellRange({ startRow: r, endRow: r, startCol: c, endCol: c });
    setContextMenu(null);
    closeFilterPopover();

    focusCell(r, c);
    e.preventDefault();
  }

  // ===== 붙여넣기/삭제: “첫 셀 누락” 방지를 위해 paste capture 단일 경로로 처리 =====
  const pasteCatcherRef = useRef<HTMLTextAreaElement | null>(null);

  async function clearSelection() {
    // 편집 draft 제거(첫 셀만 안 지워지는 잔상 방지)
    editingCellRef.current = null;
    setActiveEditCell(null);
    setActiveEditValue("");

    const el = document.activeElement as HTMLElement | null;
    if (el && el.tagName === "INPUT") (el as HTMLInputElement).blur();

    if (selectedCellRange) {
      const { startRow, endRow, startCol, endCol } = selectedCellRange;

      const updates: Array<{ id: number; patch: Record<string, any> }> = [];
      const local = [...rows];

      // displayRows 기준 선택이므로 rowId를 기반으로 처리
      for (let r = startRow; r <= endRow; r++) {
        const dRow = displayRows[r];
        if (!dRow) continue;

        const patch: Record<string, any> = {};
        const nextData: Record<string, any> = { ...dRow.data };

        for (let c = startCol; c <= endCol; c++) {
          const k = viewColumns[c];
          if (!k || isComputedColumn(k)) continue;
          nextData[k] = "";
          patch[k] = null;
        }

        // 로컬 rows(원본)에도 반영
        const idx = local.findIndex((x) => x.id === dRow.id);
        if (idx >= 0) local[idx] = { ...local[idx], data: nextData };

        updates.push({ id: dRow.id, patch });
      }

      setRows(local);
      if (updates.length) await bulkPatchSymphony({ updates });
      setContextMenu(null);
      return;
    }

    // 셀 범위 없으면 행 선택 지우기(행 전체 clear)
    const { slice } = getSelectedRowSlice();
    if (!slice.length) return;

    const updates = slice.map((row) => {
      const patch: Record<string, any> = {};
      for (const k of viewColumns) {
        if (isComputedColumn(k)) continue;
        patch[k] = null;
      }
      return { id: row.id, patch };
    });

    setRows((prev) =>
      prev.map((r) =>
        slice.some((x) => x.id === r.id)
          ? { ...r, data: { ...r.data, ...Object.fromEntries(viewColumns.map((k) => [k, ""])) } }
          : r
      )
    );

    await bulkPatchSymphony({ updates });
    setContextMenu(null);
  }

  async function pasteTextToSelection(text: string) {
    const baseRow = selectedCellRange
      ? selectedCellRange.startRow
      : Math.max(0, selectedRowRange?.start ?? 0);
    const baseCol = selectedCellRange ? selectedCellRange.startCol : 0;

    const parsed = parseExcelClipboardTSV(text);

    // 전부 빈 값(예: ""만 있는 경우)이면 무시
    const hasAnyValue = parsed.some((row) => row.some((cell) => String(cell ?? "") !== ""));
    if (!hasAnyValue) return;

    // ✅ 핵심: "완전 빈 행"("")도 엑셀처럼 '빈 행'으로 유지되도록,
    // 전체 붙여넣기 블록의 최대 컬럼 수로 행 폭을 맞춰 패딩한다.
    const maxCols = parsed.reduce((m, row) => Math.max(m, row.length), 0);
    const matrix = parsed.map((row) => {
      if (row.length >= maxCols) return row;
      return [...row, ...Array.from({ length: maxCols - row.length }, () => "")];
    });

    const updates: Array<{ id: number; patch: Record<string, any> }> = [];
    const local = [...rows];

    for (let ro = 0; ro < matrix.length; ro++) {
      const dIndex = baseRow + ro;
      const dRow = displayRows[dIndex];
      if (!dRow) break;

      const patch: Record<string, any> = {};
      const nextData: Record<string, any> = { ...dRow.data };

      for (let co = 0; co < matrix[ro].length; co++) {
        const cIndex = baseCol + co;
        if (cIndex >= viewColumns.length) break;

        const k = viewColumns[cIndex];
        if (!k || isComputedColumn(k)) continue;

        const raw = String(matrix[ro][co] ?? "");
        const v = PASTE_REPLACE_CELL_NEWLINES_WITH_SPACE ? raw.replace(/\n+/g, " ") : raw;

        nextData[k] = v;
        patch[k] = v === "" ? null : v; 
      }

      const idx = local.findIndex((x) => x.id === dRow.id);
      if (idx >= 0) local[idx] = { ...local[idx], data: nextData };

      updates.push({ id: dRow.id, patch });
    }

    setRows(local);
    if (updates.length) await bulkPatchSymphony({ updates });
    setContextMenu(null);
  }

  // paste 캡처(핵심)
  useEffect(() => {
    function onPasteCapture(e: ClipboardEvent) {
      const hasRange = !!selectedCellRange || !!selectedRowRange;
      if (!hasRange) return;

      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;

      e.preventDefault();
      e.stopPropagation();

      void pasteTextToSelection(text);
    }

    window.addEventListener("paste", onPasteCapture, true);
    return () => window.removeEventListener("paste", onPasteCapture, true);
  }, [selectedCellRange, selectedRowRange, displayRows, viewColumns, rows]);

  // Ctrl+C만 keydown에서 처리, Ctrl+V는 paste 캡처로만 처리(첫 셀 누락 방지)
  useEffect(() => {
    async function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setContextMenu(null);
        closeFilterPopover();
        return;
      }

      if (e.key === "Delete" && (selectedCellRange || selectedRowRange)) {
        e.preventDefault();
        e.stopPropagation();
        void clearSelection();
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const k = (e.key || "").toLowerCase();

      if (k === "c" && (selectedCellRange || selectedRowRange)) {
        e.preventDefault();
        e.stopPropagation();

        // copy
        if (selectedCellRange) {
          const { startRow, endRow, startCol, endCol } = selectedCellRange;
          const lines: string[] = [];
          for (let r = startRow; r <= endRow; r++) {
            const row = displayRows[r];
            if (!row) continue;
            const cells: string[] = [];
            for (let c = startCol; c <= endCol; c++) {
              const colKey = viewColumns[c];
              if (!colKey) continue;
              cells.push(getDisplayValue(row, colKey));
            }
            lines.push(cells.join("\t"));
          }
          await navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
          return;
        }

        const { slice } = getSelectedRowSlice();
        const text = slice
          .map((r) => viewColumns.map((key) => getDisplayValue(r, key)).join("\t"))
          .join("\n");
        await navigator.clipboard.writeText(text).catch(() => {});
        return;
      }

      // Ctrl+V는 여기서 처리하지 않음(브라우저 paste 이벤트로만)
      if (k === "v" && (selectedCellRange || selectedRowRange)) {
        // 포커스가 input에 있으면 그 input에서 paste가 발생할 수 있음(우린 capture에서 처리)
        // 포커스가 애매하면 hidden textarea로 포커스를 이동시켜 paste 이벤트를 확실히 받게 함
        pasteCatcherRef.current?.focus();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCellRange, selectedRowRange, displayRows, viewColumns, rows, filterPopoverOpen]);

  useEffect(() => {
    function onMouseUp() {
      setIsRowDragging(false);
      setRowDragAnchor(null);
      setIsCellDragging(false);
      setCellDragAnchor(null);
    }
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  useEffect(() => {
    function onClick() {
      setContextMenu(null);
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  // ===== 행 삽입/삭제 =====
  async function handleInsertRows() {
    const anchor = selectedRowRange?.start ?? 0;
    const beforeId = anchor > 0 ? displayRows[anchor - 1]?.id ?? null : null;
    const afterId = displayRows[anchor]?.id ?? null;
    const count = Math.max(1, (selectedRowRange?.end ?? anchor) - anchor + 1);

    await insertSymphonyRows({ count, beforeId, afterId });
    await reload();

    setContextMenu(null);
  }

  async function handleDeleteRows() {
    const { slice } = getSelectedRowSlice();
    if (!slice.length) return;

    const ids = slice.map((r) => r.id);
    await bulkDeleteSymphony({ ids });

    const idSet = new Set(ids);
    setRows((prev) => prev.filter((r) => !idSet.has(r.id)));
    setTotalCount((t) => Math.max(0, t - ids.length));

    setSelectedRowRange(null);
    setContextMenu(null);
  }

  async function handleCopyFromContext() {
    // keydown copy 로직 재사용하기 위해 강제 dispatch 대신 단순 호출
    const ev = new KeyboardEvent("keydown", { key: "c", ctrlKey: true });
    window.dispatchEvent(ev);
    setContextMenu(null);
  }

  async function handlePasteFromContext() {
    // 컨텍스트 붙여넣기도 paste 캡처 경로로 동일 처리
    const text = await navigator.clipboard.readText().catch(() => "");
    if (!text) return;
    await pasteTextToSelection(text);
    setContextMenu(null);
  }

  // ===== 칼라 적용(선택 영역 기반) =====
  async function applyColorToSelection(color: SymphonySoftColor, mode: "text" | "cell") {
    if (!selectedCellRange) return;

    const updates = buildColorBulkPatch({
      rows: displayRows,
      viewColumns,
      range: selectedCellRange,
      color,
      mode,
    });

    if (!updates.length) return;

    // 로컬 반영
    setRows((prev) => {
      const map = new Map<number, Record<string, any>>();
      for (const u of updates) map.set(u.id, u.patch.__cellStyle);

      return prev.map((r) => {
        const nextStyle = map.get(r.id);
        if (!nextStyle) return r;
        return { ...r, data: { ...r.data, __cellStyle: nextStyle } };
      });
    });

    await bulkPatchSymphony({ updates });
  }

  useImperativeHandle(
    ref,
    () => ({
      reload: (options) => reload(options),
      applyColorToSelection,
    }),
    [reload, applyColorToSelection]
  );

  // ===== 필터 팝오버 핸들러 =====
  function toggleFilterValue(colKey: string, v: string) {
    const prev = props.filterState.selectedByKey[colKey] ?? new Set<string>();
    const nextSet = new Set(prev);
    if (nextSet.has(v)) nextSet.delete(v);
    else nextSet.add(v);

    props.onFilterStateChange({
      ...props.filterState,
      selectedByKey: { ...props.filterState.selectedByKey, [colKey]: nextSet },
    });
  }

  function setFilterSearch(colKey: string, q: string) {
    props.onFilterStateChange({
      ...props.filterState,
      searchByKey: { ...props.filterState.searchByKey, [colKey]: q },
    });
  }

  function selectAllFilterValues(colKey: string) {
    const set = new Set<string>(filterValues);
    props.onFilterStateChange({
      ...props.filterState,
      selectedByKey: { ...props.filterState.selectedByKey, [colKey]: set },
    });
  }

  function clearFilterForColumn(colKey: string) {
    const nextSelected = { ...props.filterState.selectedByKey };
    delete nextSelected[colKey];

    props.onFilterStateChange({
      ...props.filterState,
      selectedByKey: nextSelected,
    });
  }

  // ===== UI =====
  if (loading) return <div className="text-center text-gray-500 py-10">Loading...</div>;
  if (error) return <div className="text-center text-red-600 py-10">{error}</div>;

  const filterActive = isFilterActive(props.filterState);

  return (
    <div
      className="w-full h-full flex flex-col"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const t = e.target as HTMLElement;
        if (t.closest("table")) return;
        if (t.closest('[data-context-menu="1"]')) return;
        if (t.closest('[data-filter-popover="1"]')) return;

        setSelectedRowRange(null);
        setSelectedCellRange(null);
        setContextMenu(null);
        closeFilterPopover();
      }}
    >
      {/* paste 이벤트를 확실히 받기 위한 숨은 textarea */}
      <textarea
        ref={pasteCatcherRef}
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "fixed",
          left: -10000,
          top: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />

      <div className="border-t border-x bg-white w-full flex-1 overflow-auto">
        <table className="w-full min-w-[2200px] table-fixed border-collapse text-[11.6px] font-[350] antialiased text-slate-800">
          <colgroup>
            <col style={{ width: 46 }} />
            {viewColumns.map((c) => (
              <col key={c} style={{ width: getWidthPx(c) }} />
            ))}
          </colgroup>

          <thead className="bg-gray-100">
            <tr>
              <th className="border px-1 py-[3px] bg-gray-100 sticky top-0 z-20" />
              {viewColumns.map((c, idx) => (
                <th key={c} className="border px-2 py-1 bg-gray-100 sticky top-0 z-20">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-full flex items-center justify-center gap-1">
                      <span className="text-center text-[11px] whitespace-nowrap overflow-hidden text-ellipsis">
                        {c}
                      </span>

                      {props.filterMode && (
                        <button
                          type="button"
                          className={`text-[10px] px-1 rounded border ${
                            filterActive ? "bg-white border-slate-300" : "bg-gray-50 border-slate-200"
                          }`}
                          title="필터"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFilterColumnKey(c);
                            setFilterPopoverAnchor({ x: e.clientX, y: e.clientY });
                            setFilterPopoverOpen(true);
                            setContextMenu(null);
                          }}
                        >
                          ▼
                        </button>
                      )}
                    </div>

                    {isColumnEditMode && (
                      <div className="flex flex-col items-center gap-1 mt-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="px-1 py-0.5 text-[11px] border border-slate-200 bg-white rounded disabled:opacity-30"
                            disabled={idx === 0}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              moveColLeft(c);
                            }}
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            className="px-1 py-0.5 text-[11px] border border-slate-200 bg-white rounded disabled:opacity-30"
                            disabled={idx === viewColumns.length - 1}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              moveColRight(c);
                            }}
                          >
                            →
                          </button>
                        </div>

                        <input
                          className="w-12 h-6 text-[11px] px-1 border border-slate-200 rounded bg-white text-slate-700"
                          type="number"
                          min={1}
                          max={200}
                          value={colWidthUnitByKey[c] ?? 20}
                          onChange={(e) => setWidthUnit(c, Number(e.target.value))}
                          onMouseDown={(e) => e.stopPropagation()}
                          title="열 넓이(unit)"
                        />
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {displayRows.map((row, rowIndex) => {
              const rowSelected = isRowSelected(rowIndex);

              return (
                <tr key={row.id}>
                 <td
                    className={
                      "border px-1 py-[3px] text-[0.68rem] text-center select-none " +
                      (rowSelected ? "bg-blue-200 text-gray-800" : "bg-gray-100 text-gray-500")
                    }
                    data-row-header="1"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      setIsRowDragging(true);
                      setRowDragAnchor(rowIndex);
                      setSelectedRowRange({ start: rowIndex, end: rowIndex });
                      setSelectedCellRange(null);
                      setContextMenu(null);
                      closeFilterPopover();
                    }}
                    onMouseEnter={() => {
                      if (!isRowDragging || rowDragAnchor == null) return;
                      const a = rowDragAnchor;
                      const b = rowIndex;
                      setSelectedRowRange(a <= b ? { start: a, end: b } : { start: b, end: a });
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!isRowSelected(rowIndex)) setSelectedRowRange({ start: rowIndex, end: rowIndex });
                      setSelectedCellRange(null);
                      setContextMenuMode("row");
                      setContextMenu({ x: e.clientX, y: e.clientY });
                      closeFilterPopover();
                    }}
                  >
                    {rowIndex + 1}
                  </td>

                  {viewColumns.map((key, colIndex) => {
                    const cellSelected = isCellSelected(rowIndex, colIndex);

                    const info = getCellStyleInfo(row.data, row.id, key);
                    const bgColor = info?.bg ? (INLINE_PALETTE[info.bg]?.bg ?? undefined) : undefined;
                    const textColor = info?.fg ? (INLINE_PALETTE[info.fg]?.text ?? undefined) : undefined;

                    // td 배경은 inline style로(=Tailwind 빌드/스캔 이슈 완전 제거)
                    const tdStyle = bgColor ? ({ backgroundColor: bgColor } as React.CSSProperties) : undefined;

                    const baseBg = rowSelected ? "bg-blue-50" : "bg-white";

                    // 선택 오버레이(원하면 나중에 조정 가능). 배경색이 있어도 살짝만 덮게 고정.
                    const selectionOverlay = cellSelected
                      ? "relative before:content-[''] before:absolute before:inset-0 before:bg-blue-200/20 before:pointer-events-none"
                      : "";

                    const cls = `border px-2 py-[3px] ${baseBg} ${selectionOverlay}`;

                    // computed: 수리횟수/거래처/대여자명은 편집 불가 + 표시만
                    if (isComputedColumn(key)) {
                      return (
                        <td
                          key={key}
                          className={cls}
                          style={tdStyle}
                          data-row={rowIndex}
                          data-col={colIndex}
                          tabIndex={-1}
                          onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            (e.currentTarget as HTMLElement).focus(); // ✅ computed 셀도 클릭 시 포커스 확보 → 방향키 동작
                            setIsCellDragging(true);
                            setCellDragAnchor({ row: rowIndex, col: colIndex });
                            setCellRangeByPoints(rowIndex, colIndex, rowIndex, colIndex);
                            setSelectedRowRange(null);
                            setContextMenu(null);
                            closeFilterPopover();
                          }}
                          onMouseEnter={() => {
                            if (!isCellDragging || !cellDragAnchor) return;
                            setCellRangeByPoints(cellDragAnchor.row, cellDragAnchor.col, rowIndex, colIndex);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCellRangeByPoints(rowIndex, colIndex, rowIndex, colIndex);
                            setSelectedRowRange(null);
                            setContextMenuMode("cell");
                            setContextMenu({ x: e.clientX, y: e.clientY });
                            closeFilterPopover();
                          }}
                        >
                          <div
                            className={`w-full ${key === "수리횟수" ? "text-center" : ""}`}
                            style={textColor ? ({ color: textColor } as React.CSSProperties) : undefined}
                          >
                            {getDisplayValue(row, key)}
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={key}
                        className={cls}
                        style={tdStyle}
                        data-row={rowIndex}
                        data-col={colIndex}
                        tabIndex={-1}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          setIsCellDragging(true);
                          setCellDragAnchor({ row: rowIndex, col: colIndex });
                          setCellRangeByPoints(rowIndex, colIndex, rowIndex, colIndex);
                          setSelectedRowRange(null);
                          setContextMenu(null);
                          closeFilterPopover();
                        }}
                        onMouseEnter={() => {
                          if (!isCellDragging || !cellDragAnchor) return;
                          setCellRangeByPoints(cellDragAnchor.row, cellDragAnchor.col, rowIndex, colIndex);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (
                            !selectedCellRange ||
                            rowIndex < selectedCellRange.startRow ||
                            rowIndex > selectedCellRange.endRow ||
                            colIndex < selectedCellRange.startCol ||
                            colIndex > selectedCellRange.endCol
                          ) {
                            setCellRangeByPoints(rowIndex, colIndex, rowIndex, colIndex);
                          }
                          setSelectedRowRange(null);
                          setContextMenuMode("cell");
                          setContextMenu({ x: e.clientX, y: e.clientY });
                          closeFilterPopover();
                        }}
                      >
                        <input
                          className={`w-full bg-transparent outline-none ${key === "에러횟수" ? "text-center" : ""}`}
                          style={textColor ? ({ color: textColor } as React.CSSProperties) : undefined}
                          value={
                            activeEditCell?.rowId === row.id && activeEditCell?.key === key
                              ? activeEditValue
                              : getDisplayValue(row, key)
                          }
                          data-row={rowIndex}
                          data-col={colIndex}
                          onFocus={(e) => {
                            setSelectedRowRange(null);
                            const initial = String(row.data?.[key] ?? "");
                            void handleFocus(row.id, key, initial, e);
                          }}
                          onChange={(e) => {
                            if (activeEditCell?.rowId === row.id && activeEditCell?.key === key) {
                              setActiveEditValue(e.target.value);
                            }
                            if (myRowLocks[row.id]) updateLocalCell(row.id, key, e.target.value);
                          }}
                          onBlur={async (e) => {
                            const v = String(e.target.value ?? "");

                            editingCellRef.current = null;
                            setActiveEditCell(null);
                            setActiveEditValue("");

                            if (!myRowLocks[row.id]) return;

                            updateLocalCell(row.id, key, v);
                            await saveCell(row.id, key, v);
                            await releaseLock("symphony", row.id);

                            setMyRowLocks((prev) => {
                              const copy = { ...prev };
                              delete copy[row.id];
                              return copy;
                            });
                          }}
                          onKeyDown={(e) => handleCellKeyDown(e, rowIndex, colIndex)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 우클릭 메뉴 */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border shadow text-xs"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          data-context-menu="1"
        >
          {contextMenuMode === "row" ? (
            <>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={handleInsertRows}>
                행 삽입
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={handleDeleteRows}>
                행 삭제
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={() => void clearSelection()}>
                내용 지우기
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={() => void handleCopyFromContext()}>
                복사(클립보드)
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={() => void handlePasteFromContext()}>
                붙여넣기(클립보드)
              </button>
            </>
          ) : (
            <>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={() => void clearSelection()}>
                내용 지우기
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={() => void handleCopyFromContext()}>
                복사(클립보드)
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={() => void handlePasteFromContext()}>
                붙여넣기(클립보드)
              </button>
            </>
          )}
        </div>
      )}

      {/* 필터 팝오버 */}
      <div data-filter-popover="1">
        <ColumnFilterPopover
          open={filterPopoverOpen}
          anchor={filterPopoverAnchor}
          columnKey={filterColumnKey}
          values={filterValues}
          selected={filterSelectedSet}
          search={filterSearch}
          onClose={closeFilterPopover}
          onSearchChange={(q) => {
            if (!filterColumnKey) return;
            setFilterSearch(filterColumnKey, q);
          }}
          onToggleValue={(v) => {
            if (!filterColumnKey) return;
            toggleFilterValue(filterColumnKey, v);
          }}
          onSelectAll={() => {
            if (!filterColumnKey) return;
            selectAllFilterValues(filterColumnKey);
          }}
          onClear={() => {
            if (!filterColumnKey) return;
            clearFilterForColumn(filterColumnKey);
          }}
          onSortAsc={() => {
            if (!filterColumnKey) return;
            props.onSortStateChange({ key: filterColumnKey, dir: "asc" });
            closeFilterPopover();
          }}
          onSortDesc={() => {
            if (!filterColumnKey) return;
            props.onSortStateChange({ key: filterColumnKey, dir: "desc" });
            closeFilterPopover();
          }}
        />
      </div>
    </div>
  );
});

export default SymphonyGrid;