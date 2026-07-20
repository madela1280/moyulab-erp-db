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

  let s = raw;

  // 괄호형 상태 제거: (대여중) / (회수중) / (미회수)
  s = s.replace(/\((대여중|회수중|미회수)\)/g, "");

  // 괄호 없이 들어온 상태 텍스트도 제거
  s = s.replace(/\s*(대여중|회수중|미회수)\s*/g, " ");

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
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("ko-KR");
}

type CellStyleInfo = { bg?: string; fg?: string };

function cellStyleKey(rowId: number, colKey: string) {
  return `${rowId}:${colKey}`;
}

const INLINE_PALETTE: Record<string, { bg: string; text: string }> = {
  red: { bg: "#FECACA", text: "#991B1B" },
  yellow: { bg: "#FEF08A", text: "#854D0E" },
  blue: { bg: "#BFDBFE", text: "#1E40AF" },
  green: { bg: "#BBF7D0", text: "#166534" },
  purple: { bg: "#E9D5FF", text: "#6B21A8" },
  black: { bg: "#CBD5E1", text: "#0F172A" },
};

function getCellStyleInfo(
  rowData: Record<string, any>,
  rowId: number,
  colKey: string
): CellStyleInfo {
  const map = (rowData?.__cellStyle ?? {}) as Record<string, CellStyleInfo>;
  return map[cellStyleKey(rowId, colKey)] ?? {};
}

function parseExcelClipboardTSV(text: string): string[][] {
  const s = String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
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

  row.push(cell);
  rows.push(row);

  if (rows.length > 1) {
    const last = rows[rows.length - 1];
    const lastAllEmpty = last.every((v) => String(v ?? "") === "");
    if (lastAllEmpty) rows.pop();
  }

  return rows.length ? rows : [[""]];
}

const PASTE_REPLACE_CELL_NEWLINES_WITH_SPACE = true;

const SymphonyGrid = forwardRef<SymphonyGridHandle, Props>(function SymphonyGrid(props, ref) {
  const { rows, setRows, setTotalCount, baseIndex, loading, error, reload } =
    useSymphonyRows();

  const { rentingDeviceNoSet, rentingInfoByDeviceNo, statusByDeviceNo } = useUnifiedRentalStatus();

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
  const myRowLocksRef = useRef<Record<number, boolean>>({});
  const lockPendingRef = useRef<Record<number, Promise<any> | null>>({});

  const editingCellRef = useRef<{ rowId: number; key: string } | null>(null);

  const activeEditCellRef = useRef<{ rowId: number; key: string } | null>(null);
  const activeEditValueRef = useRef<string>("");

  // ✅ Delete 직후 remount/blur 중에도 같은 셀 재포커스를 보장하기 위한 플래그
  const deleteRefocusRef = useRef<{ rowId: number; key: string } | null>(null);

  const [activeEditCell, setActiveEditCell] = useState<{ rowId: number; key: string } | null>(
    null
  );
  const [activeEditValue, setActiveEditValue] = useState<string>("");

  useEffect(() => {
    myRowLocksRef.current = myRowLocks;
  }, [myRowLocks]);

  function setActiveEditDraft(cell: { rowId: number; key: string }, value: string) {
    activeEditCellRef.current = cell;
    activeEditValueRef.current = value;
    editingCellRef.current = cell;
    setActiveEditCell(cell);
    setActiveEditValue(value);
  }

  function clearActiveEditDraftIfSame(rowId: number, key?: string) {
    const cur = activeEditCellRef.current;
    if (!cur) return;
    if (cur.rowId !== rowId) return;
    if (key && cur.key !== key) return;

    activeEditCellRef.current = null;
    activeEditValueRef.current = "";

    if (
      editingCellRef.current?.rowId === rowId &&
      (!key || editingCellRef.current?.key === key)
    ) {
      editingCellRef.current = null;
    }

    setActiveEditCell(null);
    setActiveEditValue("");
  }

  function getActiveSymphonyRowId(): number | null {
    try {
      const ae = document.activeElement as HTMLElement | null;
      if (!ae || ae.tagName !== "INPUT") return null;

      const rowAttr = (ae as HTMLInputElement).getAttribute("data-row");
      const rowIndex = Number(rowAttr);
      if (!Number.isFinite(rowIndex)) return null;

      return displayRows[rowIndex]?.id ?? null;
    } catch {
      return null;
    }
  }

  async function handleFocus(rowId: number, key: string, initialValue: string, e: any) {
    if (isComputedColumn(key)) {
      e.target.blur();
      return;
    }

    setActiveEditDraft({ rowId, key }, initialValue ?? "");

    // 같은 행 내 셀 이동이면 기존 락 재사용
    if (myRowLocksRef.current[rowId]) return;

    // 같은 행 lock pending이 있으면 중복 acquire 금지
    const existingPending = lockPendingRef.current[rowId];
    const pending = existingPending ?? acquireLock("symphony", rowId);

    if (!existingPending) {
      lockPendingRef.current[rowId] = pending;
    }

    const result = await pending.catch(() => null);

    if (lockPendingRef.current[rowId] === pending) {
      lockPendingRef.current[rowId] = null;
    }

    const active = editingCellRef.current;
    const stillSameCell = active?.rowId === rowId && active?.key === key;
    const stillSameRow = active?.rowId === rowId;

    if (result?.ok) {
      // 핵심: 같은 행 다른 셀로 이미 이동했으면 락 유지
      if (stillSameRow) {
        myRowLocksRef.current[rowId] = true;
        setMyRowLocks((prev) => ({ ...prev, [rowId]: true }));
        return;
      }

      await releaseLock("symphony", rowId).catch(() => {});
      return;
    }

    // 오래된 focus 응답이면 현재 입력을 건드리지 않음
    if (!stillSameCell) return;

    clearActiveEditDraftIfSame(rowId, key);
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

  async function ensureSymphonyRowLock(rowId: number) {
    if (myRowLocksRef.current[rowId]) return true;

    const pending = lockPendingRef.current[rowId];
    if (pending) {
      const r = await pending.catch(() => null);
      if (r?.ok) {
        myRowLocksRef.current[rowId] = true;
        setMyRowLocks((prev) => ({ ...prev, [rowId]: true }));
        return true;
      }
    }

    const retry = await acquireLock("symphony", rowId).catch(() => null);
    if (retry?.ok) {
      myRowLocksRef.current[rowId] = true;
      setMyRowLocks((prev) => ({ ...prev, [rowId]: true }));
      return true;
    }

    return false;
  }

  async function clearSingleSelectedCell() {
    if (!selectedCellRange) return false;

    const isSingleCell =
      selectedCellRange.startRow === selectedCellRange.endRow &&
      selectedCellRange.startCol === selectedCellRange.endCol;

    if (!isSingleCell) return false;

    const rowIndex = selectedCellRange.startRow;
    const colIndex = selectedCellRange.startCol;

    const row = displayRows[rowIndex];
    const key = viewColumns[colIndex];

    if (!row || !key || isComputedColumn(key)) return false;

    // ✅ Delete 후 같은 셀 재포커스 진행중 표시
    deleteRefocusRef.current = { rowId: row.id, key };
    setActiveEditDraft({ rowId: row.id, key }, "");

    const hasLock = await ensureSymphonyRowLock(row.id);

    if (!hasLock) {
      clearActiveEditDraftIfSame(row.id, key);
      await reload({ silent: true });
      return true;
    }

    try {
      const input = document.querySelector<HTMLInputElement>(
        `input[data-row="${rowIndex}"][data-col="${colIndex}"]`
      );

      // ✅ 1) 화면에서 즉시 삭제 + 같은 셀 커서 유지
      if (input) {
        input.value = "";
        input.focus();
        try {
          input.setSelectionRange(0, 0);
        } catch {}
      }

      // ✅ 2) 로컬 데이터 즉시 반영
      updateLocalCell(row.id, key, "");

      setSelectedRowRange(null);
      setSelectedCellRange({
        startRow: rowIndex,
        endRow: rowIndex,
        startCol: colIndex,
        endCol: colIndex,
      });

      setContextMenu(null);
      setActiveEditDraft({ rowId: row.id, key }, "");

      // ✅ 서버 저장 전/후 모두 커서 유지
      focusCellSoon(rowIndex, colIndex);
      await saveCell(row.id, key, "");
      focusCellSoon(rowIndex, colIndex);
    } catch {
      clearActiveEditDraftIfSame(row.id, key);
      deleteRefocusRef.current = null;
      await reload({ silent: true });
    }

    return true;
  }

    function getStatusBySystemDeviceNo(systemDeviceNo: any) {
    const deviceNo = normalizeDeviceNo(systemDeviceNo);
    const deviceNoLower = deviceNo.toLowerCase();
    return deviceNo
      ? statusByDeviceNo?.[deviceNo] ?? statusByDeviceNo?.[deviceNoLower] ?? ""
      : "";
  }

  // ===== 유틸: 셀 표시값(파생 포함) =====
  function getDisplayValue(row: SymphonyRow, colKey: string) {
    const deviceNo = normalizeDeviceNo(row.data?.["시스템 기기번호"]);
    const deviceNoLower = deviceNo.toLowerCase();

    const renting =
      !!deviceNo && (rentingDeviceNoSet.has(deviceNo) || rentingDeviceNoSet.has(deviceNoLower));

    const rentalInfo = deviceNo
      ? rentingInfoByDeviceNo?.[deviceNo] ?? rentingInfoByDeviceNo?.[deviceNoLower]
      : undefined;

    const status = getStatusBySystemDeviceNo(row.data?.["시스템 기기번호"]);

    if (colKey === "수리횟수") return String(calcRepairCount(row.data));

    if (colKey === "유축기 위치") {
      const raw0 = String(row.data?.[colKey] ?? "");
      const raw = stripRentingMarker(raw0);

      if (!status) return raw;
      return raw ? `${raw} (${status})` : status;
    }

    if (colKey === "거래처") {
      if (renting || status) return String(rentalInfo?.거래처분류 ?? "");
      return String(row.data?.[colKey] ?? "");
    }

    if (colKey === "대여자명") {
      if (renting || status) return String(rentalInfo?.수취인명 ?? "");
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

    const td = document.querySelector<HTMLElement>(`td[data-row="${rowIndex}"][data-col="${colIndex}"]`);
    if (td) {
      td.focus();
      return true;
    }

    return false;
  }

  function focusCellSoon(rowIndex: number, colIndex: number) {
    let tries = 0;
    const maxTries = 12;

    const tryFocus = () => {
      tries += 1;

      const input = document.querySelector<HTMLInputElement>(
        `input[data-row="${rowIndex}"][data-col="${colIndex}"]`
      );

      if (input) {
        input.focus();
        const len = (input.value ?? "").length;
        try {
          input.setSelectionRange(len, len);
        } catch {}
        return true;
      }

      return false;
    };

    const loop = () => {
      if (tryFocus()) return;
      if (tries >= maxTries) return;
      setTimeout(loop, 16);
    };

    requestAnimationFrame(loop);
  }

  function handleCellKeyDown(
    e: React.KeyboardEvent<HTMLElement>,
    rowIndex: number,
    colIndex: number
  ) {
    const isArrow =
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowLeft";

    if (!isArrow) return;

    // ✅ 방향키 이동 의도 시 Delete 재포커스 플래그 해제
    deleteRefocusRef.current = null;

    e.preventDefault();
    e.stopPropagation();

    let r = rowIndex;
    let c = colIndex;

    switch (e.key) {
      case "ArrowDown":
        if (rowIndex < displayRows.length - 1) r = rowIndex + 1;
        break;
      case "ArrowUp":
        if (rowIndex > 0) r = rowIndex - 1;
        break;
      case "ArrowRight":
        if (colIndex < viewColumns.length - 1) c = colIndex + 1;
        break;
      case "ArrowLeft":
        if (colIndex > 0) c = colIndex - 1;
        break;
    }

    setSelectedRowRange(null);
    setSelectedCellRange({ startRow: r, endRow: r, startCol: c, endCol: c });
    setContextMenu(null);
    closeFilterPopover();

    focusCell(r, c);
  }

  // ===== 붙여넣기/삭제: paste capture 단일 경로 =====
  const pasteCatcherRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ input key를 안정화(defaultValue)하면 외부 rows 변경이 즉시 안 보일 수 있어
  // 현재 포커스 input 제외한 나머지 input DOM 값을 동기화
  useEffect(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>("input[data-row][data-col]");

    inputs.forEach((input) => {
      if (document.activeElement === input) return;

      const rowIndex = Number(input.getAttribute("data-row"));
      const colIndex = Number(input.getAttribute("data-col"));

      if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return;

      const row = displayRows[rowIndex];
      const colKey = viewColumns[colIndex];

      if (!row || !colKey || isComputedColumn(colKey)) return;

      const nextValue =
        colKey === "유축기 위치"
          ? getDisplayValue(row, colKey)
          : String(row.data?.[colKey] ?? "");

      if (input.value !== nextValue) {
        input.value = nextValue;
      }
    });
  }, [displayRows, viewColumns]);

  async function clearSelection() {
    editingCellRef.current = null;
    activeEditCellRef.current = null;
    activeEditValueRef.current = "";
    setActiveEditCell(null);
    setActiveEditValue("");

    const el = document.activeElement as HTMLElement | null;
    if (el && el.tagName === "INPUT") (el as HTMLInputElement).blur();

    if (selectedCellRange) {
      const { startRow, endRow, startCol, endCol } = selectedCellRange;

      const updates: Array<{ id: number; patch: Record<string, any> }> = [];
      const local = [...rows];

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

        const idx = local.findIndex((x) => x.id === dRow.id);
        if (idx >= 0) local[idx] = { ...local[idx], data: nextData };

        updates.push({ id: dRow.id, patch });
      }

      setRows(local);
      if (updates.length) await bulkPatchSymphony({ updates });
      setContextMenu(null);
      return;
    }

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

    const hasAnyValue = parsed.some((row) => row.some((cell) => String(cell ?? "") !== ""));
    if (!hasAnyValue) return;

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

  useEffect(() => {
    async function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setContextMenu(null);
        closeFilterPopover();
        return;
      }

      if (e.key === "Delete") {
        const hasCellRange = !!selectedCellRange;
        const hasRowRange = !!selectedRowRange;

        if (!hasCellRange && !hasRowRange) return;

        const isSingleCell =
          !!selectedCellRange &&
          selectedCellRange.startRow === selectedCellRange.endRow &&
          selectedCellRange.startCol === selectedCellRange.endCol;

        e.preventDefault();
        e.stopPropagation();

        if (isSingleCell) {
          void clearSingleSelectedCell();
          return;
        }

        void clearSelection();
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const k = (e.key || "").toLowerCase();

      if (k === "c" && (selectedCellRange || selectedRowRange)) {
        e.preventDefault();
        e.stopPropagation();

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

      if (k === "v" && (selectedCellRange || selectedRowRange)) {
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

  useEffect(() => {
    function onArrowKeyDown(e: KeyboardEvent) {
      const isArrow =
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight";
      if (!isArrow) return;

      const ae = document.activeElement as HTMLElement | null;
      const tag = (ae?.tagName || "").toUpperCase();
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!ae?.isContentEditable;
      if (isEditable) return;

      if (!selectedCellRange) return;

      // ✅ 방향키 이동 의도 시 Delete 재포커스 플래그 해제
      deleteRefocusRef.current = null;

      e.preventDefault();
      e.stopPropagation();

      let r = selectedCellRange.startRow;
      let c = selectedCellRange.startCol;

      if (e.key === "ArrowDown") {
        if (r < displayRows.length - 1) r += 1;
      } else if (e.key === "ArrowUp") {
        if (r > 0) r -= 1;
      } else if (e.key === "ArrowRight") {
        if (c < viewColumns.length - 1) c += 1;
      } else if (e.key === "ArrowLeft") {
        if (c > 0) c -= 1;
      }

      setSelectedRowRange(null);
      setSelectedCellRange({ startRow: r, endRow: r, startCol: c, endCol: c });
      setContextMenu(null);
      closeFilterPopover();

      focusCell(r, c);
    }

    window.addEventListener("keydown", onArrowKeyDown, true);
    return () => window.removeEventListener("keydown", onArrowKeyDown, true);
  }, [selectedCellRange, displayRows.length, viewColumns.length]);

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
    const ev = new KeyboardEvent("keydown", { key: "c", ctrlKey: true });
    window.dispatchEvent(ev);
    setContextMenu(null);
  }

  async function handlePasteFromContext() {
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

                    const tdStyle = bgColor ? ({ backgroundColor: bgColor } as React.CSSProperties) : undefined;

                    const baseBg = rowSelected ? "bg-blue-50" : "bg-white";
                    const selectionOverlay = cellSelected
                      ? "relative before:content-[''] before:absolute before:inset-0 before:bg-blue-200/20 before:pointer-events-none"
                      : "";

                    const cls = `border px-2 py-[3px] ${baseBg} ${selectionOverlay}`;

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
                            (e.currentTarget as HTMLElement).focus();
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
                          key={`${row.id}:${key}`}
                          className={`w-full bg-transparent outline-none ${key === "에러횟수" ? "text-center" : ""}`}
                          style={textColor ? ({ color: textColor } as React.CSSProperties) : undefined}
                          defaultValue={
                            key === "유축기 위치"
                              ? getDisplayValue(row, key)
                              : String(row.data?.[key] ?? "")
                          }
                          data-row={rowIndex}
                          data-col={colIndex}
                          onFocus={(e) => {
                            setSelectedRowRange(null);

                            // ✅ Delete 직후 복구 대상 셀은 유지, 다른 셀 포커스 시에는 플래그 해제
                            const cur = deleteRefocusRef.current;
                            if (cur && !(cur.rowId === row.id && cur.key === key)) {
                              deleteRefocusRef.current = null;
                            }

                            // 유축기 위치는 표시용 상태 텍스트를 제거한 "원본값"으로 편집 시작
                            if (key === "유축기 위치") {
                              const pure = stripRentingMarker(e.target.value);
                              if (e.target.value !== pure) {
                                e.target.value = pure;
                              }
                            }

                            const initial =
                              key === "유축기 위치"
                                ? stripRentingMarker(String(e.target.value ?? ""))
                                : String(row.data?.[key] ?? "");

                            void handleFocus(row.id, key, initial, e);
                          }}
                          onChange={(e) => {
                            const next = e.target.value;

                            // ✅ Delete 후 바로 입력 시작하면 재포커스 플래그 해제
                            const cur = deleteRefocusRef.current;
                            if (cur?.rowId === row.id && cur.key === key) {
                              deleteRefocusRef.current = null;
                            }

                            // 입력 중 setRows 금지
                            activeEditCellRef.current = { rowId: row.id, key };
                            activeEditValueRef.current = next;
                            editingCellRef.current = { rowId: row.id, key };
                          }}
                          onBlur={async (e) => {
                            const blurRowId = row.id;
                            const blurKey = key;
                            const inputValue = String(e.target.value ?? "");
                            const v = blurKey === "유축기 위치" ? stripRentingMarker(inputValue) : inputValue;

                            if (
                              deleteRefocusRef.current?.rowId === blurRowId &&
                              deleteRefocusRef.current?.key === blurKey
                            ) {
                              deleteRefocusRef.current = null;
                            }

                            let hasLock = !!myRowLocksRef.current[blurRowId];

                            if (!hasLock) {
                              const pending = lockPendingRef.current[blurRowId];
                              if (pending) {
                                const r = await pending.catch(() => null);
                                if (r?.ok) {
                                  hasLock = true;
                                  myRowLocksRef.current[blurRowId] = true;
                                  setMyRowLocks((prev) => ({ ...prev, [blurRowId]: true }));
                                }
                              }
                            }

                            if (!hasLock) {
                              const retry = await acquireLock("symphony", blurRowId).catch(() => null);
                              if (retry?.ok) {
                                hasLock = true;
                                myRowLocksRef.current[blurRowId] = true;
                                setMyRowLocks((prev) => ({ ...prev, [blurRowId]: true }));
                              }
                            }

                            if (!hasLock) {
                              clearActiveEditDraftIfSame(blurRowId, blurKey);
                              await reload({ silent: true });
                              return;
                            }

                            try {
                              updateLocalCell(blurRowId, blurKey, v);
                              await saveCell(blurRowId, blurKey, v);

                              // 유축기 위치는 blur 후 다시 "표시용 상태"를 붙여 보여줌(저장은 원본값)
                              if (blurKey === "유축기 위치") {
                                const status = getStatusBySystemDeviceNo(row.data?.["시스템 기기번호"]);
                                const display = status ? (v ? `${v} (${status})` : status) : v;
                                e.target.value = display;
                              }
                            } catch {
                              clearActiveEditDraftIfSame(blurRowId, blurKey);
                              await reload({ silent: true });
                            } finally {
                              const nextFocusedRowId = getActiveSymphonyRowId();
                              const keepRowLock = nextFocusedRowId === blurRowId;

                              if (!keepRowLock) {
                                clearActiveEditDraftIfSame(blurRowId, blurKey);
                              }

                              if (!keepRowLock && hasLock) {
                                await releaseLock("symphony", blurRowId).catch(() => {});
                                delete myRowLocksRef.current[blurRowId];
                                setMyRowLocks((prev) => {
                                  const copy = { ...prev };
                                  delete copy[blurRowId];
                                  return copy;
                                });
                              }
                            }
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