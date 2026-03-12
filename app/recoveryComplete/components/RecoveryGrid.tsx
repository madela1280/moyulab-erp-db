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
import { syncEmitUnifiedUpdate, syncListen } from "@/global-sync/sync-engine";

import ColumnFilterPopover from "@/unified/filter/ColumnFilterPopover";
import { isFilterActive, type ColumnFilterState } from "@/unified/filter/useUnifiedFilter";
import type { UnifiedSortState } from "@/unified/filter/useUnifiedSort";

import type { RecoveryScope } from "@/recoveryComplete/components/RecoveryMain";
import {
  bulkDeleteRecoveryRows,
  bulkPatchRecoveryRows,
  fetchRecoveryByIds,
  fetchRecoveryCount,
  fetchRecoveryNextPage,
  fetchRecoveryPrevPage,
  fetchRecoveryTailData,
  insertRecoveryRows,
  type RecoveryRow,
} from "@/recoveryComplete/service/serviceRecovery";

export type RecoveryGridHandle = {
  appendBlankRows: (count: number) => Promise<void>;
  scrollToTailData: () => void;
};

type Props = {
  scope: RecoveryScope;
  title: string;

  isColumnEditMode?: boolean;

  availableColumns: string[];

  columnOrder: string[];
  onColumnOrderChange: (next: string[]) => void;

  colWidthUnitByKey: Record<string, number>;
  onColWidthUnitByKeyChange: (next: Record<string, number>) => void;

  filterMode?: boolean;
  filterState?: ColumnFilterState;
  onFilterStateChange?: (next: ColumnFilterState) => void;

  sortState?: UnifiedSortState;
  onSortStateChange?: (next: UnifiedSortState) => void;
};

const MIN_REAL_ROWS = 100;
const PAGE_SIZE = 500;
const WINDOW_MAX_ROWS = 1500;

const ROW_HEIGHT = 24;
const OVERSCAN = 12;

// ✅ 드래그 민감도(엑셀처럼 “클릭 후 드래그”일 때만 범위 확장)
const CELL_DRAG_THRESHOLD_PX = 10;

function clampUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function shallowEqualRecord(
  a: Record<string, any> | undefined,
  b: Record<string, any> | undefined
) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function calcVisibleRange(el: HTMLDivElement, rowCount: number) {
  const top = el.scrollTop;
  const height = el.clientHeight;

  const start = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    Math.max(0, rowCount - 1),
    Math.ceil((top + height) / ROW_HEIGHT) + OVERSCAN
  );

  return { start, end };
}

const RecoveryGrid = forwardRef<RecoveryGridHandle, Props>(function RecoveryGrid(
  props,
  ref
) {
  const {
    scope,
    title,
    isColumnEditMode = false,
    availableColumns,
    columnOrder,
    onColumnOrderChange,
    colWidthUnitByKey,
    onColWidthUnitByKeyChange,
    filterMode = false,
    filterState,
    onFilterStateChange,
    sortState,
    onSortStateChange,
  } = props;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [rows, setRows] = useState<RecoveryRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [baseIndex, setBaseIndex] = useState(1);

  const rowsRef = useRef<RecoveryRow[]>([]);
  const totalCountRef = useRef(0);
  const baseIndexRef = useRef(1);

  useEffect(() => void (rowsRef.current = rows), [rows]);
  useEffect(() => void (totalCountRef.current = totalCount), [totalCount]);
  useEffect(() => void (baseIndexRef.current = baseIndex), [baseIndex]);

  const viewColumns = columnOrder;

  // --- filter/sort display rows ---
  const computedDisplayRows = useMemo(() => {
    let out = rows;

    const selectedByKey = filterState?.selectedByKey ?? {};
    const entries = Object.entries(selectedByKey);

    if (filterMode && entries.length) {
      out = out.filter((row) => {
        for (const [k, set] of entries) {
          if (!set || set.size === 0) continue;
          const v = String(row.data?.[k] ?? "");
          if (!set.has(v)) return false;
        }
        return true;
      });
    }

    const sortKey = sortState?.key ?? null;
    if (filterMode && sortKey) {
      const dir = sortState?.dir === "desc" ? "desc" : "asc";
      const copy = [...out];
      copy.sort((a, b) => {
        const av = String(a.data?.[sortKey] ?? "").trim();
        const bv = String(b.data?.[sortKey] ?? "").trim();
        const cmp = av.localeCompare(bv, "ko-KR");
        return dir === "asc" ? cmp : -cmp;
      });
      out = copy;
    }

    return out;
  }, [rows, filterMode, filterState, sortState]);

  // 필터 모드에서 목록 고정(편집으로 결과 튀는 것 방지)
  const [filterFrozenIds, setFilterFrozenIds] = useState<number[] | null>(null);

  useEffect(() => {
    if (!filterMode) {
      setFilterFrozenIds(null);
      return;
    }
    setFilterFrozenIds(computedDisplayRows.map((r) => r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode, filterState, sortState]);

  const rowsById = useMemo(() => {
    const m = new Map<number, RecoveryRow>();
    for (const r of rows) m.set(r.id, r);
    return m;
  }, [rows]);

  const displayRows = useMemo(() => {
    if (filterMode && filterFrozenIds) {
      const out: RecoveryRow[] = [];
      for (const id of filterFrozenIds) {
        const r = rowsById.get(id);
        if (r) out.push(r);
      }
      return out;
    }
    return computedDisplayRows;
  }, [filterMode, filterFrozenIds, rowsById, computedDisplayRows]);

  const displayRowsRef = useRef<RecoveryRow[]>([]);
  useEffect(() => void (displayRowsRef.current = displayRows), [displayRows]);

  // --- visible range ---
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });
  const visibleRangeRef = useRef({ start: 0, end: 0 });

  function updateVisibleRangeNow() {
    const el = scrollRef.current;
    if (!el) return;
    const r = calcVisibleRange(el, displayRowsRef.current.length);
    visibleRangeRef.current = r;
    setVisibleRange(r);
  }

  // ✅ (Fix) 첫 진입/탭 전환 시 컨테이너 높이 계산이 늦어서 visibleRange가 (0,0)으로 남는 케이스 방지
  // - scroll 영역의 실제 size가 잡히는 타이밍에 맞춰 visibleRange를 강제 갱신
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let raf1 = 0;
    let raf2 = 0;

    const run = () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          updateVisibleRangeNow();
        });
      });
    };

    run();

    // element size 변화(처음 표시/레이아웃 확정) 감지
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => run());
      ro.observe(el);
    }

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (ro) ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // ✅ rows/filter 결과가 바뀌어 displayRows 길이가 변한 직후에도 1회 갱신
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateVisibleRangeNow();
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayRows.length, scope]);

  // --- selection (row / cell range) ---
  const [selectedRowRange, setSelectedRowRange] = useState<{ start: number; end: number } | null>(
    null
  );

  const [selectedCellRange, setSelectedCellRange] = useState<{
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
  } | null>(null);

  function setCellRangeByPoints(r1: number, c1: number, r2: number, c2: number) {
    const rowCount = displayRowsRef.current.length;
    const colCount = viewColumns.length;

    const startRow = Math.max(0, Math.min(r1, r2));
    const endRow = Math.min(rowCount - 1, Math.max(r1, r2));
    const startCol = Math.max(0, Math.min(c1, c2));
    const endCol = Math.min(colCount - 1, Math.max(c1, c2));

    setSelectedCellRange({ startRow, endRow, startCol, endCol });
  }

  function isRowSelected(rowIndex: number) {
    if (!selectedRowRange) return false;
    return rowIndex >= selectedRowRange.start && rowIndex <= selectedRowRange.end;
  }

  function isCellSelected(rowIndex: number, colIndex: number) {
    if (!selectedCellRange) return false;
    const { startRow, endRow, startCol, endCol } = selectedCellRange;
    return rowIndex >= startRow && rowIndex <= endRow && colIndex >= startCol && colIndex <= endCol;
  }

  function getSelectedRowRangeInfo() {
    if (!selectedRowRange) return { start: 0, end: -1, slice: [] as RecoveryRow[] };
    const safeStart = Math.max(0, selectedRowRange.start);
    const safeEnd = Math.min(displayRowsRef.current.length - 1, selectedRowRange.end);
    return {
      start: safeStart,
      end: safeEnd,
      slice: displayRowsRef.current.slice(safeStart, safeEnd + 1),
    };
  }

  // ✅ 드래그 상태(행/셀) — “마우스 움직이기만 해도 선택 확장” 방지
  const [isRowDragging, setIsRowDragging] = useState(false);
  const [rowDragAnchor, setRowDragAnchor] = useState<number | null>(null);

  const [isCellDragging, setIsCellDragging] = useState(false);
  const [cellDragAnchor, setCellDragAnchor] = useState<{ row: number; col: number } | null>(null);
  const cellDragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const cellDragMovedRef = useRef(false);

  // cell drag threshold
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!isCellDragging) return;
      if (cellDragMovedRef.current) return;

      const start = cellDragStartPosRef.current;
      if (!start) return;

      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);

      if (dx >= CELL_DRAG_THRESHOLD_PX || dy >= CELL_DRAG_THRESHOLD_PX) {
        cellDragMovedRef.current = true;
      }
    }

    window.addEventListener("mousemove", onMove, true);
    return () => window.removeEventListener("mousemove", onMove, true);
  }, [isCellDragging]);

  // drag end safety
  useEffect(() => {
    function endAllDragging() {
      setIsRowDragging(false);
      setRowDragAnchor(null);

      setIsCellDragging(false);
      setCellDragAnchor(null);

      cellDragStartPosRef.current = null;
      cellDragMovedRef.current = false;
    }

    function onVisibilityChange() {
      if (document.hidden) endAllDragging();
    }

    window.addEventListener("mouseup", endAllDragging);
    window.addEventListener("blur", endAllDragging);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("mouseup", endAllDragging);
      window.removeEventListener("blur", endAllDragging);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // --- context menu ---
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [ctxMode, setCtxMode] = useState<"row" | "cell">("row");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCtx(null);
    }
    function onClick() {
      setCtx(null);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, []);

  // --- filter popover ---
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [filterPopoverAnchor, setFilterPopoverAnchor] = useState<{ x: number; y: number } | null>(
    null
  );
  const [filterColumnKey, setFilterColumnKey] = useState<string | null>(null);

  const filterActive = filterState ? isFilterActive(filterState) : false;

  const filterValues = useMemo(() => {
    if (!filterColumnKey) return [];
    const set = new Set<string>();
    for (const r of rows) set.add(String(r.data?.[filterColumnKey] ?? ""));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko-KR"));
  }, [rows, filterColumnKey]);

  const filterSelectedSet = useMemo(() => {
    if (!filterColumnKey) return new Set<string>();
    return (filterState?.selectedByKey?.[filterColumnKey] ?? new Set<string>()) as Set<string>;
  }, [filterState, filterColumnKey]);

  const filterSearch = useMemo(() => {
    if (!filterColumnKey) return "";
    return String(filterState?.searchByKey?.[filterColumnKey] ?? "");
  }, [filterState, filterColumnKey]);

  function closeFilterPopover() {
    setFilterPopoverOpen(false);
    setFilterPopoverAnchor(null);
    setFilterColumnKey(null);
  }

  function toggleFilterValue(colKey: string, v: string) {
    if (!onFilterStateChange || !filterState) return;
    const prev = filterState.selectedByKey[colKey] ?? new Set<string>();
    const next = new Set(prev);
    if (next.has(v)) next.delete(v);
    else next.add(v);

    onFilterStateChange({
      ...filterState,
      selectedByKey: { ...filterState.selectedByKey, [colKey]: next },
    });
  }

  function setFilterSearch(colKey: string, q: string) {
    if (!onFilterStateChange || !filterState) return;
    onFilterStateChange({
      ...filterState,
      searchByKey: { ...filterState.searchByKey, [colKey]: q },
    });
  }

  function selectAllFilterValues(colKey: string) {
    if (!onFilterStateChange || !filterState) return;
    onFilterStateChange({
      ...filterState,
      selectedByKey: { ...filterState.selectedByKey, [colKey]: new Set(filterValues) },
    });
  }

  function clearFilterForColumn(colKey: string) {
    if (!onFilterStateChange || !filterState) return;
    const nextSelected = { ...filterState.selectedByKey };
    delete nextSelected[colKey];
    onFilterStateChange({ ...filterState, selectedByKey: nextSelected });
  }

  // --- column edit helpers ---
  function moveColLeft(key: string) {
    const i = viewColumns.indexOf(key);
    if (i <= 0) return;
    const next = [...viewColumns];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onColumnOrderChange(next);
  }

  function moveColRight(key: string) {
    const i = viewColumns.indexOf(key);
    if (i < 0 || i >= viewColumns.length - 1) return;
    const next = [...viewColumns];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onColumnOrderChange(next);
  }

  function setWidthUnit(key: string, unit: number) {
    const safe = clampUnit(unit);
    onColWidthUnitByKeyChange({ ...colWidthUnitByKey, [key]: safe });
  }

  function getWidthPx(key: string) {
    const BASE = 140;
    const MIN = 40;
    const MAX = key === "계약자주소" ? 525 : 420;
    const unit = colWidthUnitByKey[key] ?? 20;
    const px = Math.round((BASE * unit) / 20);
    return Math.max(MIN, Math.min(MAX, px));
  }

  // --- lock/editing ---
  const myRowLocksRef = useRef<Record<number, boolean>>({});
  const lockPendingRef = useRef<Record<number, Promise<any> | null>>({});
  const editingCellRef = useRef<{ rowId: number; key: string } | null>(null);

  async function handleFocus(rowId: number, key: string, e: any) {
    editingCellRef.current = { rowId, key };
    const p = acquireLock(scope, rowId);
    lockPendingRef.current[rowId] = p;

    const result = await p;
    lockPendingRef.current[rowId] = null;

    const stillActive =
      editingCellRef.current?.rowId === rowId && editingCellRef.current?.key === key;

    if (!stillActive) {
      if (result?.ok) await releaseLock(scope, rowId);
      return;
    }

    if (result?.ok) {
      myRowLocksRef.current[rowId] = true;
      return;
    }

    editingCellRef.current = null;
    if (result?.reason === "locked_by_other" && result?.lock) {
      alert(`${result.lock.locked_by_name}님이 이 행을 편집 중입니다.`);
    } else {
      alert("이 행을 편집할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    }

    try {
      e?.target?.blur?.();
    } catch {
      // ignore
    }
  }

  function updateLocalCell(id: number, key: string, value: any) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, data: { ...(r.data ?? {}), [key]: value } } : r))
    );
  }

  async function saveCell(rowId: number, key: string, value: string) {
    const { rows: serverRows } = await bulkPatchRecoveryRows({
      scope,
      updates: [{ id: rowId, patch: { [key]: value === "" ? null : value } }],
    });

    if (Array.isArray(serverRows) && serverRows.length) {
      const map = new Map<number, RecoveryRow>();
      for (const r of serverRows) map.set(Number(r.id), r);

      setRows((prev) =>
        prev.map((row) => {
          const s = map.get(row.id);
          if (!s) return row;
          const nextData = (s.data ?? row.data) as any;
          const nextSortKey = s.sort_key ?? row.sort_key;
          if (shallowEqualRecord(row.data ?? {}, nextData ?? {}) && nextSortKey === row.sort_key) {
            return row;
          }
          return { ...row, data: nextData, sort_key: nextSortKey };
        })
      );
    }

    syncEmitUnifiedUpdate();
  }

  // --- data loading ---
  async function ensureMinRowsInDb() {
    const count = await fetchRecoveryCount(scope);
    if (count >= MIN_REAL_ROWS) return;

    const need = MIN_REAL_ROWS - count;
    await insertRecoveryRows({ scope, count: need, beforeId: null, afterId: null });
  }

  async function loadTailPage() {
    await ensureMinRowsInDb();
    const j = await fetchRecoveryTailData(scope, PAGE_SIZE);
    setRows(j.rows ?? []);
    setTotalCount(Number(j.total ?? 0));
    setBaseIndex(Number(j.baseIndex ?? 1));
  }

  async function refreshVisibleRowsFromServer() {
    const cur = displayRowsRef.current.length ? displayRowsRef.current : rowsRef.current;
    if (!cur.length) return;

    const el = scrollRef.current;
    const vr = el ? calcVisibleRange(el, cur.length) : visibleRangeRef.current;

    const start = Math.max(0, vr.start);
    const end = Math.min(cur.length - 1, vr.end);

    const ids = cur.slice(start, end + 1).map((r) => r.id);
    if (!ids.length) return;

    const fresh = await fetchRecoveryByIds(scope, ids);
    if (!Array.isArray(fresh) || !fresh.length) return;

    const map = new Map<number, RecoveryRow>();
    for (const r of fresh) map.set(r.id, r);

    setRows((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        const f = map.get(row.id);
        if (!f) return row;

        const editing = editingCellRef.current;
        let nextData = (f.data ?? row.data) as Record<string, any>;

        if (editing && editing.rowId === row.id && editing.key) {
          nextData = { ...(nextData ?? {}), [editing.key]: (row.data ?? {})[editing.key] };
        }

        const nextSortKey = f.sort_key ?? row.sort_key;
        const same = shallowEqualRecord(row.data ?? {}, nextData ?? {}) && nextSortKey === row.sort_key;
        if (same) return row;

        changed = true;
        return { ...row, data: nextData, sort_key: nextSortKey };
      });

      return changed ? next : prev;
    });
  }

  useEffect(() => {
    const off = syncListen(() => {
      window.setTimeout(() => {
        void refreshVisibleRowsFromServer();
        void (async () => {
          try {
            const c = await fetchRecoveryCount(scope);
            setTotalCount(c);
          } catch {
            // ignore
          }
        })();
      }, 200);
    });

    return () => off?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    void (async () => {
      await loadTailPage();
      requestAnimationFrame(() => updateVisibleRangeNow());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    function onResize() {
      updateVisibleRangeNow();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // --- paging ---
  const isPagingRef = useRef(false);

  function getCursorFromFirstRow() {
    const first = rowsRef.current[0];
    if (!first) return null;
    return { sortKey: Number(first.sort_key ?? 0), id: Number(first.id) };
  }

  function getCursorFromLastRow() {
    const last = rowsRef.current[rowsRef.current.length - 1];
    if (!last) return null;
    return { sortKey: Number(last.sort_key ?? 0), id: Number(last.id) };
  }

  async function loadPrevPage() {
    if (isPagingRef.current) return;
    if (baseIndexRef.current <= 1) return;

    const cur = getCursorFromFirstRow();
    if (!cur) return;

    isPagingRef.current = true;
    try {
      const el = scrollRef.current;
      const prevH = el?.scrollHeight ?? 0;

      const j = await fetchRecoveryPrevPage({
        scope,
        beforeSortKey: cur.sortKey,
        beforeId: cur.id,
        limit: PAGE_SIZE,
      });

      const newRows = j.rows ?? [];
      if (!newRows.length) return;

      setTotalCount(Number(j.total ?? totalCountRef.current));
      setBaseIndex(Number(j.baseIndex ?? baseIndexRef.current));

      setRows((prev) => {
        const merged = [...newRows, ...prev];
        return merged.length > WINDOW_MAX_ROWS ? merged.slice(0, WINDOW_MAX_ROWS) : merged;
      });

      requestAnimationFrame(() => {
        const el2 = scrollRef.current;
        if (!el2) return;
        const nextH = el2.scrollHeight;
        const delta = nextH - prevH;
        if (delta > 0) el2.scrollTop += delta;
        updateVisibleRangeNow();
      });
    } finally {
      isPagingRef.current = false;
    }
  }

  async function loadNextPage() {
    if (isPagingRef.current) return;

    const cur = getCursorFromLastRow();
    if (!cur) return;

    const lastGlobalIndex = baseIndexRef.current + rowsRef.current.length - 1;
    const total = totalCountRef.current;
    if (total > 0 && lastGlobalIndex >= total) return;

    isPagingRef.current = true;
    try {
      const j = await fetchRecoveryNextPage({
        scope,
        afterSortKey: cur.sortKey,
        afterId: cur.id,
        limit: PAGE_SIZE,
      });

      const newRows = j.rows ?? [];
      if (!newRows.length) return;

      setTotalCount(Number(j.total ?? totalCountRef.current));

      setRows((prev) => {
        let merged = [...prev, ...newRows];
        if (merged.length > WINDOW_MAX_ROWS) {
          const remove = merged.length - WINDOW_MAX_ROWS;
          merged = merged.slice(remove);
          setBaseIndex((b) => b + remove);
        }
        return merged;
      });
    } finally {
      isPagingRef.current = false;
    }
  }

  // --- copy/paste ---
  async function copySelectionToClipboard() {
    if (selectedCellRange) {
      const { startRow, endRow, startCol, endCol } = selectedCellRange;
      const lines: string[] = [];

      for (let r = startRow; r <= endRow; r++) {
        const row = displayRowsRef.current[r];
        if (!row) continue;

        const cells: string[] = [];
        for (let c = startCol; c <= endCol; c++) {
          const key = viewColumns[c];
          cells.push(String(row.data?.[key] ?? ""));
        }
        lines.push(cells.join("\t"));
      }

      await navigator.clipboard.writeText(lines.join("\n")).catch(() => void 0);
      setCtx(null);
      return;
    }

    const { slice } = getSelectedRowRangeInfo();
    if (!slice.length) return;

    const lines = slice.map((row) =>
      viewColumns.map((k) => String(row.data?.[k] ?? "")).join("\t")
    );

    await navigator.clipboard.writeText(lines.join("\n")).catch(() => void 0);
    setCtx(null);
  }

  async function pasteTextToSelectedRange(text: string) {
    let baseRowIndex = 0;
    let baseColIndex = 0;

    if (selectedCellRange) {
      baseRowIndex = selectedCellRange.startRow;
      baseColIndex = selectedCellRange.startCol;
    } else if (selectedRowRange) {
      baseRowIndex = Math.max(0, selectedRowRange.start);
      baseColIndex = 0;
    }

    const lines = String(text ?? "")
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0);

    if (!lines.length) return;

    const parsed = lines.map((line) => line.split("\t"));
    const targetRows = displayRowsRef.current.slice(baseRowIndex, baseRowIndex + parsed.length);
    if (!targetRows.length) return;

    const updates: Array<{ id: number; patch: Record<string, any> }> = [];

    for (let i = 0; i < targetRows.length; i++) {
      const row = targetRows[i];
      const src = parsed[i] ?? [];

      const patch: Record<string, any> = {};
      for (let j = 0; j < src.length; j++) {
        const colIndex = baseColIndex + j;
        if (colIndex >= viewColumns.length) break;
        const key = viewColumns[colIndex];
        patch[key] = src[j] ?? "";
      }

      if (Object.keys(patch).length) updates.push({ id: row.id, patch });
    }

    if (!updates.length) return;

    const patchById = new Map<number, Record<string, any>>();
    for (const u of updates) patchById.set(u.id, u.patch);

    setRows((prev) =>
      prev.map((r) => {
        const p = patchById.get(r.id);
        if (!p) return r;
        return { ...r, data: { ...(r.data ?? {}), ...p } };
      })
    );

    const res = await bulkPatchRecoveryRows({ scope, updates });
    const serverRows = Array.isArray(res?.rows) ? res.rows : null;

    if (serverRows && serverRows.length) {
      const map = new Map<number, RecoveryRow>();
      for (const r of serverRows) map.set(Number(r.id), r);

      setRows((prev) =>
        prev.map((row) => {
          const s = map.get(row.id);
          if (!s) return row;
          return { ...row, data: (s.data ?? row.data) as any, sort_key: s.sort_key ?? row.sort_key };
        })
      );
    }

    syncEmitUnifiedUpdate();
    setCtx(null);
  }

  async function pasteFromClipboard() {
    const text = await navigator.clipboard.readText().catch(() => "");
    if (!text) return;
    await pasteTextToSelectedRange(text);
  }

  // Ctrl+C / Ctrl+V
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e as any).isComposing) return;
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const key = (e.key || "").toLowerCase();
      const hasRange = !!selectedCellRange || !!selectedRowRange;
      if (!hasRange) return;

      if (key === "c") {
        e.preventDefault();
        e.stopPropagation();
        void copySelectionToClipboard();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [selectedCellRange, selectedRowRange]);

  // paste capture: 범위 붙여넣기
  useEffect(() => {
    function onPasteCapture(e: ClipboardEvent) {
      const hasRange = !!selectedCellRange || !!selectedRowRange;
      if (!hasRange) return;

      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;

      e.preventDefault();
      e.stopPropagation();

      void pasteTextToSelectedRange(text);
    }

    window.addEventListener("paste", onPasteCapture, true);
    return () => window.removeEventListener("paste", onPasteCapture, true);
  }, [selectedCellRange, selectedRowRange]);

  // Delete: 셀 범위면 내용 지우기, 행 선택이면 행 삭제
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Delete") return;
      if ((e as any).isComposing) return;

      const hasCell = !!selectedCellRange;
      const hasRow = !!selectedRowRange;
      if (!hasCell && !hasRow) return;

      e.preventDefault();
      e.stopPropagation();

      void (async () => {
        if (hasRow && !hasCell) {
          const { slice } = getSelectedRowRangeInfo();
          if (!slice.length) return;

          const ids = slice.map((r) => r.id);
          await bulkDeleteRecoveryRows({ scope, ids }).catch(() => void 0);

          setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
          setTotalCount((t) => Math.max(0, t - ids.length));

          syncEmitUnifiedUpdate();
          setSelectedRowRange(null);
          setCtx(null);
          return;
        }

        if (selectedCellRange) {
          const { startRow, endRow, startCol, endCol } = selectedCellRange;
          const selected = displayRowsRef.current.slice(startRow, endRow + 1);

          const updates: Array<{ id: number; patch: Record<string, any> }> = [];
          for (const row of selected) {
            const patch: Record<string, any> = {};
            for (let c = startCol; c <= endCol; c++) {
              const key = viewColumns[c];
              patch[key] = null;
            }
            updates.push({ id: row.id, patch });
          }

          const patchById = new Map<number, Record<string, any>>();
          for (const u of updates) patchById.set(u.id, u.patch);

          setRows((prev) =>
            prev.map((r) => {
              const p = patchById.get(r.id);
              if (!p) return r;
              return { ...r, data: { ...(r.data ?? {}), ...p } };
            })
          );

          await bulkPatchRecoveryRows({ scope, updates }).catch(() => void 0);
          syncEmitUnifiedUpdate();
          setCtx(null);
        }
      })();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCellRange, selectedRowRange, scope, viewColumns]);

  // --- exposed handle ---
  async function appendBlankRows(count: number) {
    if (count <= 0) return;
    await insertRecoveryRows({ scope, count, beforeId: null, afterId: null });
    syncEmitUnifiedUpdate();
    await loadTailPage();
  }

  function scrollToTailData() {
    void (async () => {
      await loadTailPage();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (!el) return;
          const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
          el.scrollTop = Math.max(0, maxTop - Math.floor(el.clientHeight * 0.6));
          updateVisibleRangeNow();
        });
      });
    })();
  }

  useImperativeHandle(ref, () => ({ appendBlankRows, scrollToTailData }), [scope]);

  if (!rows.length) {
    return <div className="text-center text-gray-500 py-10">Loading...</div>;
  }

  const start = Math.max(0, visibleRange.start);
  const end = Math.min(displayRows.length - 1, visibleRange.end);
  const visible = displayRows.slice(start, end + 1);
  const topH = start * ROW_HEIGHT;
  const bottomH = Math.max(0, (displayRows.length - (end + 1)) * ROW_HEIGHT);

  return (
    <div
      className="w-full h-full flex flex-col"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("table")) return;

        if (
          target.closest('[data-row-header="1"]') ||
          target.closest('[data-context-menu="1"]') ||
          target.closest('[data-filter-popover="1"]')
        )
          return;

        setSelectedRowRange(null);
        setSelectedCellRange(null);
        setCtx(null);
        closeFilterPopover();
      }}
    >
      <div
        ref={scrollRef}
        className="border-t border-x bg-white w-full flex-1 overflow-auto"
        onScroll={(e) => {
          const el = e.currentTarget;

          const r = calcVisibleRange(el, displayRows.length);
          visibleRangeRef.current = r;
          setVisibleRange(r);

          const threshold = 120;

          const allowPaging = !filterMode && !(sortState?.key ?? null);
          if (!allowPaging) return;

          if (el.scrollTop <= threshold) void loadPrevPage();
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) void loadNextPage();
        }}
      >
        <table
          className="w-full min-w-[2800px] table-fixed border-collapse text-[11.6px] font-[350] antialiased text-slate-800"
          style={{ fontFamily: '"Malgun Gothic","Apple SD Gothic Neo","Segoe UI",sans-serif' }}
        >
          <colgroup>
            <col style={{ width: 40 }} />
            {viewColumns.map((c) => (
              <col key={c} style={{ width: getWidthPx(c) }} />
            ))}
          </colgroup>

          <thead className="bg-gray-100">
            <tr>
              <th className="border px-1 py-[3px] w-10 bg-gray-100 sticky top-0 z-30" />
              {viewColumns.map((c, idx) => (
                <th
                  key={c}
                  className="border px-2 py-1 align-top bg-gray-100 sticky top-0 z-30"
                >
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-full flex items-center justify-center gap-1">
                      <span className="text-center text-[11px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                        {c}
                      </span>

                      {filterMode && (
                        <button
                          type="button"
                          className={`text-[10px] px-1 rounded border ${
                            filterActive
                              ? "bg-white border-slate-300"
                              : "bg-gray-50 border-slate-200"
                          }`}
                          title="필터"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFilterColumnKey(c);
                            setFilterPopoverAnchor({ x: e.clientX, y: e.clientY });
                            setFilterPopoverOpen(true);
                            setCtx(null);
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
                            className="px-1 py-0.5 text-[11px] border border-slate-200 bg-white text-slate-600 rounded disabled:opacity-30"
                            disabled={idx === 0}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              moveColLeft(c);
                            }}
                            title="왼쪽으로 이동"
                          >
                            ←
                          </button>

                          <button
                            type="button"
                            className="px-1 py-0.5 text-[11px] border border-slate-200 bg-white text-slate-600 rounded disabled:opacity-30"
                            disabled={idx === viewColumns.length - 1}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              moveColRight(c);
                            }}
                            title="오른쪽으로 이동"
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
                          title="열 넓이(unit). 20=기준"
                        />
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {topH > 0 && (
              <tr>
                <td
                  colSpan={viewColumns.length + 1}
                  style={{ height: topH, padding: 0, border: "none" }}
                />
              </tr>
            )}

            {visible.map((row, i) => {
              const rowIndex = start + i;
              const rowSelected = isRowSelected(rowIndex);

              const headerCellBase =
                "border px-1 py-[3px] text-[0.68rem] text-center select-none" +
                (rowSelected
                  ? " bg-blue-200 text-gray-800"
                  : " bg-gray-100 text-gray-500");

              return (
                <tr key={row.id} data-unified-id={row.id}>
                  <td
                    className={headerCellBase}
                    data-row-header="1"
                    data-row-index={rowIndex}
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      setIsRowDragging(true);
                      setRowDragAnchor(rowIndex);
                      setSelectedRowRange({ start: rowIndex, end: rowIndex });
                      setSelectedCellRange(null);
                      setCtx(null);
                    }}
                    onMouseEnter={() => {
                      if (!isRowDragging || rowDragAnchor === null) return;
                      const a = rowDragAnchor;
                      const b = rowIndex;
                      setSelectedRowRange({ start: Math.min(a, b), end: Math.max(a, b) });
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();

                      if (!isRowSelected(rowIndex)) {
                        setSelectedRowRange({ start: rowIndex, end: rowIndex });
                      }
                      setSelectedCellRange(null);
                      setCtxMode("row");
                      setCtx({ x: e.clientX, y: e.clientY });
                    }}
                  >
                    {baseIndex + rowIndex}
                  </td>

                  {viewColumns.map((key, colIndex) => {
                    const cellSelected = isCellSelected(rowIndex, colIndex);

                    const dataCellBase =
                      "border px-2 py-[3px]" +
                      (cellSelected
                        ? " bg-blue-200"
                        : rowSelected
                        ? " bg-blue-50"
                        : " bg-white");

                    return (
                      <td
                        key={key}
                        className={dataCellBase}
                        data-row-index={rowIndex}
                        data-col-index={colIndex}
                        data-col-key={key}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;

                          cellDragStartPosRef.current = { x: e.clientX, y: e.clientY };
                          cellDragMovedRef.current = false;

                          setIsCellDragging(true);
                          setCellDragAnchor({ row: rowIndex, col: colIndex });

                          setCellRangeByPoints(rowIndex, colIndex, rowIndex, colIndex);
                          setSelectedRowRange(null);
                          setCtx(null);
                        }}
                        onMouseEnter={() => {
                          // ✅ 드래그 중 + threshold 넘었을 때만 범위 확장
                          if (!isCellDragging || !cellDragAnchor) return;
                          if (!cellDragMovedRef.current) return;

                          setCellRangeByPoints(
                            cellDragAnchor.row,
                            cellDragAnchor.col,
                            rowIndex,
                            colIndex
                          );
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();

                          if (
                            selectedCellRange &&
                            rowIndex >= selectedCellRange.startRow &&
                            rowIndex <= selectedCellRange.endRow &&
                            colIndex >= selectedCellRange.startCol &&
                            colIndex <= selectedCellRange.endCol
                          ) {
                            // keep
                          } else {
                            setCellRangeByPoints(rowIndex, colIndex, rowIndex, colIndex);
                          }

                          setSelectedRowRange(null);
                          setCtxMode("cell");
                          setCtx({ x: e.clientX, y: e.clientY });
                        }}
                      >
                        <input
                          key={`${row.id}:${key}:${String(row.data?.[key] ?? "")}`}
                          className={`w-full bg-transparent outline-none text-slate-900 ${
                            key === "계약자주소" ? "text-[10.8px]" : "text-[11.6px]"
                          }`}
                          defaultValue={String(row.data?.[key] ?? "")}
                          data-row={rowIndex}
                          data-col={colIndex}
                          onFocus={(e) => {
                            void handleFocus(row.id, key, e);
                            setSelectedRowRange(null);
                            setCellRangeByPoints(rowIndex, colIndex, rowIndex, colIndex);
                          }}
                          onBlur={async (e) => {
                            const v = String((e.target as HTMLInputElement).value ?? "");

                            let hasLock = !!myRowLocksRef.current[row.id];
                            if (!hasLock) {
                              const pending = lockPendingRef.current[row.id];
                              if (pending) {
                                const r = await pending.catch(() => null);
                                if (r?.ok) hasLock = true;
                              }
                            }

                            if (!hasLock) {
                              await refreshVisibleRowsFromServer().catch(() => void 0);
                              return;
                            }

                            try {
                              updateLocalCell(row.id, key, v);
                              await saveCell(row.id, key, v);
                            } finally {
                              editingCellRef.current = null;
                              await releaseLock(scope, row.id).catch(() => void 0);
                              delete myRowLocksRef.current[row.id];
                            }
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {bottomH > 0 && (
              <tr>
                <td
                  colSpan={viewColumns.length + 1}
                  style={{ height: bottomH, padding: 0, border: "none" }}
                />
              </tr>
            )}
          </tbody>
        </table>

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
              if (!filterColumnKey || !onSortStateChange) return;
              onSortStateChange({ key: filterColumnKey, dir: "asc" });
              closeFilterPopover();
            }}
            onSortDesc={() => {
              if (!filterColumnKey || !onSortStateChange) return;
              onSortStateChange({ key: filterColumnKey, dir: "desc" });
              closeFilterPopover();
            }}
          />
        </div>
      </div>

      {ctx && (
        <div
          className="fixed z-50 bg-white border shadow text-xs"
          style={{ top: ctx.y, left: ctx.x }}
          data-context-menu="1"
        >
          {ctxMode === "row" && (
            <>
              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={async () => {
                  const { start, end } = getSelectedRowRangeInfo();
                  const N = Math.max(1, end - start + 1);

                  const beforeId =
                    start > 0 ? displayRowsRef.current[start - 1]?.id ?? null : null;
                  const afterId = displayRowsRef.current[start]?.id ?? null;

                  await insertRecoveryRows({ scope, count: N, beforeId, afterId }).catch(
                    () => void 0
                  );
                  syncEmitUnifiedUpdate();
                  await loadTailPage();
                  setCtx(null);
                }}
              >
                행 삽입
              </button>

              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={async () => {
                  const { slice } = getSelectedRowRangeInfo();
                  const ids = slice.map((r) => r.id);
                  if (!ids.length) return;

                  await bulkDeleteRecoveryRows({ scope, ids }).catch(() => void 0);
                  setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
                  setTotalCount((t) => Math.max(0, t - ids.length));
                  syncEmitUnifiedUpdate();

                  setSelectedRowRange(null);
                  setCtx(null);
                }}
              >
                행 삭제
              </button>

              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={async () => {
                  const { slice } = getSelectedRowRangeInfo();
                  if (!slice.length) return;

                  const updates = slice.map((r) => {
                    const patch: Record<string, any> = {};
                    for (const k of viewColumns) patch[k] = null;
                    return { id: r.id, patch };
                  });

                  setRows((prev) =>
                    prev.map((r) => {
                      const u = updates.find((x) => x.id === r.id);
                      if (!u) return r;
                      return { ...r, data: { ...(r.data ?? {}), ...u.patch } };
                    })
                  );

                  await bulkPatchRecoveryRows({ scope, updates }).catch(() => void 0);
                  syncEmitUnifiedUpdate();
                  setCtx(null);
                }}
              >
                내용 지우기
              </button>

              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={() => void copySelectionToClipboard()}
              >
                복사(클립보드)
              </button>

              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={() => void pasteFromClipboard()}
              >
                붙여넣기(클립보드)
              </button>
            </>
          )}

          {ctxMode === "cell" && (
            <>
              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={async () => {
                  if (!selectedCellRange) return;
                  const { startRow, endRow, startCol, endCol } = selectedCellRange;

                  const selected = displayRowsRef.current.slice(startRow, endRow + 1);
                  const updates = selected.map((row) => {
                    const patch: Record<string, any> = {};
                    for (let c = startCol; c <= endCol; c++) patch[viewColumns[c]] = null;
                    return { id: row.id, patch };
                  });

                  const patchById = new Map<number, Record<string, any>>();
                  for (const u of updates) patchById.set(u.id, u.patch);

                  setRows((prev) =>
                    prev.map((r) => {
                      const p = patchById.get(r.id);
                      if (!p) return r;
                      return { ...r, data: { ...(r.data ?? {}), ...p } };
                    })
                  );

                  await bulkPatchRecoveryRows({ scope, updates }).catch(() => void 0);
                  syncEmitUnifiedUpdate();
                  setCtx(null);
                }}
              >
                내용 지우기
              </button>

              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={() => void copySelectionToClipboard()}
              >
                복사(클립보드)
              </button>

              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={() => void pasteFromClipboard()}
              >
                붙여넣기(클립보드)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default RecoveryGrid;