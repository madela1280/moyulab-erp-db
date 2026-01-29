// app/unified/components/UnifiedGrid.tsx
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
import {
  syncListen,
  syncPatch,
  syncEmitUnifiedUpdate,
} from "@/global-sync/sync-engine";
import { acquireLock, releaseLock } from "@/global-lock/lock-engine";

// ✅ 컬럼 정의는 외부 파일로 이동(저장/로딩 모듈에서도 공유하기 위함)
import {
  unifiedColumns,
  DEFAULT_COL_WIDTH_UNIT_BY_KEY,
} from "@/unified/columns/unifiedColumns";

import { calcUnifiedStatus } from "@/unified/status/calcUnifiedStatus";
import { useUnifiedStatusTicker } from "@/unified/status/useUnifiedStatusTicker";
import { countExtensionRounds } from "@/views/unified/extensions/extensionCompute";

// ✅ (추가) 통합관리 필터/정렬 UI (심포니 동일 UX)
import ColumnFilterPopover from "@/unified/filter/ColumnFilterPopover";
import {
  applyUnifiedFilter,
  getUniqueValuesForColumn,
  isFilterActive,
  type ColumnFilterState,
} from "@/unified/filter/useUnifiedFilter";
import { applyUnifiedSort, type UnifiedSortState } from "@/unified/filter/useUnifiedSort";

// ✅ (추가) 통합관리 칼라
import { buildUnifiedColorBulkPatch } from "@/unified/color/applyUnifiedColor";
import type { UnifiedSoftColor } from "@/unified/color/ColorPopover";
import type { ColorApplyMode } from "@/unified/color/ColorModeToggle";

export type UnifiedGridHandle = {
  appendBlankRows: (count: number) => Promise<void>;
  applyColorToSelection: (color: UnifiedSoftColor, mode: ColorApplyMode) => Promise<void>;
  scrollToTailData: () => void; // ✅ 필터 토글 후 “마지막 데이터 근처”로 복귀용
};

type UnifiedRow = { id: number; data: Record<string, any>; sort_key?: number };

// 항상 DB에 최소로 유지할 실제 행 개수
const MIN_REAL_ROWS = 100;

// 화면에 한 번에 로드할 행 개수(성능 핵심)
const PAGE_SIZE = 500;

// 화면에 유지할 최대 행 수(무한 스크롤 시 DOM 과부하 방지)
const WINDOW_MAX_ROWS = 1500;

// ✅ 날짜 컬럼: 20260101 입력을 2026-01-01로 정규화(저장 시점에만 적용)
const DATE_KEYS = new Set([
  "택배발송일",
  "시작일",
  "종료일",
  "반납요청일",
  "반납완료일",
  "신청일",
]);

function normalizeDateInput(raw: string) {
  const s = String(raw ?? "").trim();
  if (!s) return s;

  // YYYYMMDD -> YYYY-MM-DD
  if (/^\d{8}$/.test(s)) {
    return s.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  }

  // YYYY-M-D / YYYY.MM.DD / YYYY/MM/DD -> pad
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) {
    const y = m[1];
    const mo = String(m[2]).padStart(2, "0");
    const d = String(m[3]).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  return s;
}

// 삽입용 완전 빈 data 생성
function createEmptyData(): Record<string, any> {
  const obj: Record<string, any> = {};
  unifiedColumns.forEach((key) => {
    obj[key] = "";
  });
  return obj;
}

type UnifiedGridProps = {
  isColumnEditMode?: boolean;

  // ✅ (P0) 열이동 저장을 위해, 컬럼 상태를 외부에서 주입/저장 가능하게 확장
  columnOrder?: string[];
  onColumnOrderChange?: (next: string[]) => void;

  colWidthUnitByKey?: Record<string, number>;
  onColWidthUnitByKeyChange?: (next: Record<string, number>) => void;

  // ✅ (추가) 필터/정렬 (심포니 동일 UX)
  filterMode?: boolean;
  filterState?: ColumnFilterState;
  onFilterStateChange?: (next: ColumnFilterState) => void;

  sortState?: UnifiedSortState;
  onSortStateChange?: (next: UnifiedSortState) => void;
};

const UnifiedGrid = forwardRef<UnifiedGridHandle, UnifiedGridProps>(
  function UnifiedGrid(props, ref) {
    const [rows, setRows] = useState<UnifiedRow[]>([]);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [baseIndex, setBaseIndex] = useState<number>(1); // rows[0]의 "전체 기준" 행번호(1-based)
    const [myRowLocks, setMyRowLocks] = useState<Record<number, boolean>>({});

    // ✅ myRowLocks(state)는 반영 타이밍이 늦을 수 있어 blur 시점에 false로 읽히는 경우가 있음
    //    → ref를 “즉시 source of truth”로 사용해서 입력 사라짐 방지
    const myRowLocksRef = useRef<Record<number, boolean>>({});

 // ✅ 상태 컬럼은 DB 저장값이 아니라 "오늘 기준 파생 표시"로 처리
// - 자정에 자동으로 다시 계산되어 만기 D-5→D-4 같은 변화가 반영됨
const { today } = useUnifiedStatusTicker();

function getDerivedStatusForRow(rowData: Record<string, any>) {
  return calcUnifiedStatus(
    {
      // ✅ 발송전은 완전 빈행에는 표시하지 않기 위해 최소 정보도 같이 전달
      수취인명: rowData?.["수취인명"],
      연락처1: rowData?.["연락처1"],
      계약자주소: rowData?.["계약자주소"],

      택배발송일: rowData?.["택배발송일"],
      시작일: rowData?.["시작일"],
      종료일: rowData?.["종료일"],
      반납요청일: rowData?.["반납요청일"],
      반납완료일: rowData?.["반납완료일"],
    },
    today
  );
}

   // ===== 최신 state 스냅샷(ref) 유지: syncListen 중복구독/스테일 클로저 방지 =====
const rowsRef = useRef<UnifiedRow[]>([]);
const visibleRangeRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
const totalCountRef = useRef<number>(0);
const baseIndexRef = useRef<number>(1);

useEffect(() => {
  rowsRef.current = rows;
}, [rows]);

// (삭제) visibleRange는 setVisibleRange 하는 지점에서 visibleRangeRef를 직접 갱신함

useEffect(() => {
  totalCountRef.current = totalCount;
}, [totalCount]);

useEffect(() => {
  baseIndexRef.current = baseIndex;
}, [baseIndex]);

function shallowEqualRecord(a: Record<string, any> | undefined, b: Record<string, any> | undefined) {
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

// ===== 원격 sync 이벤트 coalesce(여러번 와도 1번만 반영) =====
const remoteSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const remoteSyncPendingRef = useRef(false);
const remoteSyncInFlightRef = useRef(false);

// full reload(큰 점멸)는 “버스트당 1회”로 제한
const lastFullReloadAtRef = useRef(0);
const FULL_RELOAD_MIN_INTERVAL_MS = 1200;

const lastLocalUnifiedEmitAtRef = useRef<number>(0);
const IGNORE_SELF_ECHO_MS = 1200;

// ✅ meta=count는 비용/렌더 영향이 커서 너무 자주 치면 입력/스크롤이 불안정해질 수 있음
const lastCountCheckAtRef = useRef<number>(0);
const COUNT_CHECK_MIN_INTERVAL_MS = 2500;

function requestApplyRemoteSync() {
  // ✅ 소켓 echo(내가 저장한 것도 다시 받음) 때문에 즉시 refreshVisibleRowsFromServer가 돌면
  //    입력/삭제가 “점멸 후 복구”처럼 보일 수 있음 → 유휴(idle)일 때만 반영
  remoteSyncPendingRef.current = true;
  pendingRemoteUpdateRef.current = true;

  // 기존 디바운스 타이머는 정리(있다면 취소)
  if (remoteSyncTimerRef.current) {
    clearTimeout(remoteSyncTimerRef.current);
    remoteSyncTimerRef.current = null;
  }

  // ✅ 유휴 상태에서만 applyRemoteSyncOnce 수행(입력 안정성 최우선)
  scheduleIdleReload(600);
}

// 열이동/열폭: "표시용 UI 상태" (DB/동기화와 무관)
const isColumnEditMode = !!props.isColumnEditMode;

async function applyRemoteSyncOnce() {
  // suppress 기간이면 이번 버스트는 흡수
  if (Date.now() < suppressReloadUntilRef.current) return;

  if (editingCellRef.current) {
    pendingReloadRef.current = true;
    return;
  }

  if (remoteSyncInFlightRef.current) return;

  remoteSyncInFlightRef.current = true;
  try {
    if (!remoteSyncPendingRef.current) return;
    remoteSyncPendingRef.current = false;

    await refreshVisibleRowsFromServer();
    await refreshCountAndMaybeReload();
  } finally {
    remoteSyncInFlightRef.current = false;
  }
}

    // ✅ 내부 기본값(기존 흐름 보존용)
const [columnOrderState, setColumnOrderState] = useState<string[]>(() => [
  ...unifiedColumns,
]);

const [colWidthUnitByKeyState, setColWidthUnitByKeyState] = useState<
  Record<string, number>
>(() => ({ ...DEFAULT_COL_WIDTH_UNIT_BY_KEY }));

// ✅ 외부에서 내려오면(=저장/로드 훅) 그 값을 사용, 없으면 기존처럼 내부 state 사용
const columnOrder = props.columnOrder ?? columnOrderState;
const colWidthUnitByKey = props.colWidthUnitByKey ?? colWidthUnitByKeyState;

function setColumnOrderNext(updater: (prev: string[]) => string[]) {
  if (props.onColumnOrderChange) {
    const next = updater(columnOrder);
    props.onColumnOrderChange(next);
  } else {
    setColumnOrderState(updater);
  }
}

function setColWidthUnitByKeyNext(
  updater: (prev: Record<string, number>) => Record<string, number>
) {
  if (props.onColWidthUnitByKeyChange) {
    const next = updater(colWidthUnitByKey);
    props.onColWidthUnitByKeyChange(next);
  } else {
    setColWidthUnitByKeyState(updater);
  }
}

const viewColumns = columnOrder;

// ✅ (추가) 필터/정렬 적용된 표시 rows
const filterMode = !!props.filterMode;
const filterState = props.filterState;
const sortState = props.sortState;

// ✅ 필터 모드에서는 "행 목록"을 고정해서, 편집으로 필터 결과가 즉시 바뀌지 않게 함
const [filterFrozenIds, setFilterFrozenIds] = useState<number[] | null>(null);

// ✅ 편집 중에는 displayRows를 스냅샷으로 고정(행 튕김/사라짐 방지)
const [displayRowsFrozen, setDisplayRowsFrozen] = useState<UnifiedRow[] | null>(null);

const computedDisplayRows = useMemo(() => {
  function getDisplayText(row: UnifiedRow, key: string) {
    if (key === "상태") return String(getDerivedStatusForRow(row.data ?? {}).status ?? "");
    if (key === "총연장횟수") return String(countExtensionRounds(row.data ?? {}));
    return String(row.data?.[key] ?? "");
  }

  let out = rows;

   // filter: 표시값 기준
  if (filterState?.selectedByKey) {
    const entries = Object.entries(filterState.selectedByKey);
    if (entries.length) {
      out = out.filter((row) => {
       
        for (const [key, selectedSet] of entries) {
          if (!selectedSet || selectedSet.size === 0) continue;
          const v = getDisplayText(row, key);
          if (!selectedSet.has(v)) return false;
        }
        return true;
      });
    }
  }

  // sort: 표시값 기준
  if (sortState?.key) {
    const k = sortState.key;
    const dir = sortState.dir === "desc" ? "desc" : "asc";
    const copy = [...out];
    copy.sort((a, b) => {
      const av = getDisplayText(a, k).trim();
      const bv = getDisplayText(b, k).trim();
      const cmp = av.localeCompare(bv, "ko-KR");
      return dir === "asc" ? cmp : -cmp;
    });
    out = copy;
  }

  return out;
}, [rows, filterState, sortState, today]);

useEffect(() => {
  if (!filterMode) {
    setFilterFrozenIds(null);
    return;
  }
  // ✅ 필터/정렬이 바뀌었을 때만(=사용자가 조작했을 때만) 목록 재계산
  setFilterFrozenIds(computedDisplayRows.map((r) => r.id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filterMode, filterState, sortState]);

const rowsById = useMemo(() => {
  const m = new Map<number, UnifiedRow>();
  for (const r of rows) m.set(r.id, r);
  return m;
}, [rows]);

const displayRows = useMemo(() => {
  // 편집 중 freeze가 최우선
  if (displayRowsFrozen) return displayRowsFrozen;

  // 필터 모드면 frozen id 기준으로만 보여줌(값은 rows에서 최신 반영)
  if (filterMode && filterFrozenIds) {
    const out: UnifiedRow[] = [];
    for (const id of filterFrozenIds) {
      const r = rowsById.get(id);
      if (r) out.push(r);
    }
    return out;
  }

  return computedDisplayRows;
}, [displayRowsFrozen, filterMode, filterFrozenIds, rowsById, computedDisplayRows]);

// ✅ “화면에 실제로 보이는 목록” 스냅샷(ref)
// - visibleRange(인덱스)는 displayRows 기준이므로,
//   서버 부분 갱신(refreshVisibleRowsFromServer)도 같은 기준을 써야 화면이 안 흔들림
const displayRowsRef = useRef<UnifiedRow[]>([]);
useEffect(() => {
  displayRowsRef.current = displayRows;
}, [displayRows]);

// ✅ (추가) 필터 팝오버 상태
const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
const [filterPopoverAnchor, setFilterPopoverAnchor] = useState<{ x: number; y: number } | null>(null);
const [filterColumnKey, setFilterColumnKey] = useState<string | null>(null);

const filterValues = useMemo(() => {
  if (!filterColumnKey) return [];

  function getDisplayText(row: UnifiedRow, key: string) {
    if (key === "상태") return String(getDerivedStatusForRow(row.data ?? {}).status ?? "");
    if (key === "총연장횟수") return String(countExtensionRounds(row.data ?? {}));
    return String(row.data?.[key] ?? "");
  }

  const set = new Set<string>();
  for (const r of rows) set.add(getDisplayText(r, filterColumnKey));

  return Array.from(set).sort((a, b) => a.localeCompare(b, "ko-KR"));
}, [rows, filterColumnKey, today]);

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

const filterActive = filterState ? isFilterActive(filterState) : false;

function toggleFilterValue(colKey: string, v: string) {
  if (!props.onFilterStateChange || !filterState) return;
  const prev = filterState.selectedByKey[colKey] ?? new Set<string>();
  const nextSet = new Set(prev);
  if (nextSet.has(v)) nextSet.delete(v);
  else nextSet.add(v);

  props.onFilterStateChange({
    ...filterState,
    selectedByKey: { ...filterState.selectedByKey, [colKey]: nextSet },
  });
}

function setFilterSearch(colKey: string, q: string) {
  if (!props.onFilterStateChange || !filterState) return;
  props.onFilterStateChange({
    ...filterState,
    searchByKey: { ...filterState.searchByKey, [colKey]: q },
  });
}

function selectAllFilterValues(colKey: string) {
  if (!props.onFilterStateChange || !filterState) return;
  const set = new Set<string>(filterValues);
  props.onFilterStateChange({
    ...filterState,
    selectedByKey: { ...filterState.selectedByKey, [colKey]: set },
  });
}

function clearFilterForColumn(colKey: string) {
  if (!props.onFilterStateChange || !filterState) return;
  const nextSelected = { ...filterState.selectedByKey };
  delete nextSelected[colKey];

  props.onFilterStateChange({
    ...filterState,
    selectedByKey: nextSelected,
  });
}

function isExtensionKey(key: any) {
  return (
    key === "1차연장" ||
    key === "2차연장" ||
    key === "3차연장" ||
    key === "4차연장" ||
    key === "5차연장" ||
    key === "6차연장" ||
    key === "7차연장"
  );
}

type CellStyleInfo = { bg?: string; fg?: string };

function cellStyleKey(rowId: number, colKey: string) {
  return `${rowId}:${colKey}`;
}

// ✅ Tailwind 스캔 이슈 없이 항상 동작하도록 inline 색으로 렌더
const INLINE_PALETTE: Record<string, { bg: string; text: string }> = {
  red: { bg: "#FECACA", text: "#991B1B" },
  yellow: { bg: "#FEF08A", text: "#854D0E" },
  blue: { bg: "#BFDBFE", text: "#1E40AF" },
  green: { bg: "#BBF7D0", text: "#166534" },
  purple: { bg: "#E9D5FF", text: "#6B21A8" },
  black: { bg: "#CBD5E1", text: "#0F172A" },
};

function getCellStyleInfo(rowData: Record<string, any>, rowId: number, colKey: string): CellStyleInfo {
  const map = (rowData?.__cellStyle ?? {}) as Record<string, CellStyleInfo>;
  return map[cellStyleKey(rowId, colKey)] ?? {};
}

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
  // unit=20일 때 기존 체감에 맞추기(너무 커지지 않게 BASE를 보수적으로)
  const BASE = 140;
  const MIN = 40;

  // ✅ "계약자주소"만 최대 75까지 (140*75/20 = 525px)
  const MAX = key === "계약자주소" ? 525 : 420;

  const unit = colWidthUnitByKey[key] ?? 20;
  const px = Math.round((BASE * unit) / 20);
  return Math.max(MIN, Math.min(MAX, px));
}

    // 행 범위 선택 상태
    const [selectedRowRange, setSelectedRowRange] = useState<{
      start: number;
      end: number;
    } | null>(null);
    const [isRowDragging, setIsRowDragging] = useState(false);
    const [rowDragAnchor, setRowDragAnchor] = useState<number | null>(null);

    // 셀 범위 선택 상태 (사각형)
    const [selectedCellRange, setSelectedCellRange] = useState<{
      startRow: number;
      endRow: number;
      startCol: number;
      endCol: number;
    } | null>(null);
    const [isCellDragging, setIsCellDragging] = useState(false);
    const [cellDragAnchor, setCellDragAnchor] = useState<{
      row: number;
      col: number;
    } | null>(null);

    // ✅ 연장(1~7차) 같은 "클릭이 그리드 선택을 막는" 셀에서도
    // 마우스를 올리면 선택처럼 보이도록 하는 hover 표시용 상태
    const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const didInitialScrollRef = useRef(false);   

    // 편집 중 syncListen이 들어오면 즉시 reload하지 않고 보류(입력 튕김 방지)
    const editingCellRef = useRef<{ rowId: number; key: string } | null>(null);
    const pendingReloadRef = useRef(false);

    // 빠른 입력(락 획득 전 입력 유실) 방지: 활성 셀 draft
    const [activeEditCell, setActiveEditCell] = useState<{
      rowId: number;
      key: string;
    } | null>(null);
    const [activeEditValue, setActiveEditValue] = useState<string>("");

    // ✅ 입력 안정성: 타이핑 중에는 row.data를 건드리지 않고, 셀별 draft로만 value를 유지
    const [draftByCell, setDraftByCell] = useState<Record<string, string>>({});
    function draftKey(rowId: number, colKey: string) {
      return `${rowId}:${colKey}`;
    }

        // 포커스 경쟁/이탈 처리용
    const focusSeqRef = useRef(0);

        // ✅ 락 획득이 끝나기 전에 blur가 나가도 저장이 되도록 "락 대기"를 추적
    const lockPendingRef = useRef<Record<number, Promise<any> | null>>({});

    
    // Ctrl+V로 우리가 직접 붙여넣기 처리할 때, 브라우저 기본 paste 1회를 무시하기 위한 플래그
    const skipNextNativePasteRef = useRef(false);

    // Ctrl+V를 항상 이 textarea로 받아서(=paste 이벤트 강제) 한 셀 몰빵 native paste를 원천 차단
    const pasteCatcherRef = useRef<HTMLTextAreaElement | null>(null);

    // 붙여넣기 후 포커스를 되돌릴 셀(없으면 선택범위 시작 셀로)
    const lastFocusForPasteRef = useRef<{ rowIndex: number; colIndex: number } | null>(null);

    // unified:update 연타/중복 reload로 인한 점멸 완화(디바운스 + suppress)
    const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressReloadUntilRef = useRef<number>(0);

      // 안정화: 다른 PC/탭에서 온 업데이트로 인해 즉시 reload(대량 렌더)로 멈추는 것 방지
    const lastUserActionAtRef = useRef<number>(Date.now());
    const pendingRemoteUpdateRef = useRef<boolean>(false);
    const idleReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    function markUserAction() {
      lastUserActionAtRef.current = Date.now();
    }

    function scheduleIdleReload(checkDelayMs = 600) {
      if (idleReloadTimerRef.current) clearTimeout(idleReloadTimerRef.current);
      idleReloadTimerRef.current = setTimeout(async () => {
        // 아직 반영할 원격 업데이트가 없으면 종료
        if (!pendingRemoteUpdateRef.current) return;

        // suppress 기간이면 미룸
        if (Date.now() < suppressReloadUntilRef.current) {
          scheduleIdleReload(checkDelayMs);
          return;
        }

        // 편집 중이면 미룸 (편집 종료 시점에 즉시 reload하지 않고, 유휴 상태에서만 reload)
        if (editingCellRef.current) {
          scheduleIdleReload(checkDelayMs);
          return;
        }

        // 사용자가 최근에 조작했으면 미룸(유휴 상태에서만 reload)
        const idleMs = Date.now() - lastUserActionAtRef.current;
        if (idleMs < 2500) {
          scheduleIdleReload(checkDelayMs);
          return;
        }

        // 이제 안전하게 “부분 반영” (스크롤/입력 안정성)
        pendingRemoteUpdateRef.current = false;
        await applyRemoteSyncOnce(); 
      }, checkDelayMs);
    }

    function scheduleReload(delayMs = 180) {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        reload();
      }, delayMs);
    }

   function suppressReloadFor(ms: number) {
      // row 작업(삽입/삭제/지우기) 후에는 tailData reload가 무거워서
      // 2.5초로는 부족 → 자동으로 8초로 늘려 사용자 다음 동작을 막지 않게 함
      const effectiveMs = ms >= 2500 ? 8000 : ms;

      suppressReloadUntilRef.current = Date.now() + effectiveMs;

      // ★ 이미 예약된 reload까지 취소하지 않으면, stale 데이터를 다시 받아와서
      // 방금 붙여넣은 화면을 덮어써 "사라진 것처럼" 보일 수 있음
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    }

    // 컨텍스트 메뉴 위치 + 모드(row / cell)
    const [rowContextMenu, setRowContextMenu] = useState<{
      x: number;
      y: number;
    } | null>(null);
    const [contextMenuMode, setContextMenuMode] = useState<"row" | "cell">(
      "row"
    );

   /* --------------------- 최소 100개 실제 행 확보 --------------------- */
async function ensureMinRowsInDb() {
  const r = await fetch("/api/unified?meta=count", { cache: "no-store" });
  const j = await r.json();
  const count = Number(j?.count ?? 0);

  if (count < MIN_REAL_ROWS) {
    const need = MIN_REAL_ROWS - count;

    await fetch("/api/unified/insert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: need, beforeId: null, afterId: null }),
    });
  }
}

async function refreshCountAndMaybeReload() {
  const now = Date.now();
  if (now - lastCountCheckAtRef.current < COUNT_CHECK_MIN_INTERVAL_MS) return;
  lastCountCheckAtRef.current = now;

  const r = await fetch("/api/unified?meta=count", { cache: "no-store" });
  const j = await r.json();
  const cnt = Number(j?.count ?? 0);

  if (!Number.isFinite(cnt)) return;

  const prevTotal = totalCountRef.current;

  // count 변화(=삽입/삭제)일 때만 full reload
  if (cnt !== prevTotal && cnt > 0) {
    totalCountRef.current = cnt;
    setTotalCount(cnt);

    // ✅ 말 그대로 “큰 점멸”은 버스트당 1회로 제한
    const now = Date.now();
    if (now - lastFullReloadAtRef.current < FULL_RELOAD_MIN_INTERVAL_MS) return;
    lastFullReloadAtRef.current = now;

    await reload();
  }
}

    const ROW_HEIGHT = 24;      // 테이블 1행 높이(대략)
    const OVERSCAN = 12;        // 화면 밖 여유 렌더링

    const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
      start: 0,
      end: 0,
    });

    function calcVisibleRange(el: HTMLDivElement, rowCount: number) {
      const top = el.scrollTop;
      const height = el.clientHeight;

      const start = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN);
      const end = Math.min(
        rowCount - 1,
        Math.ceil((top + height) / ROW_HEIGHT) + OVERSCAN
      );

      return { start, end };
    }

    function updateVisibleRangeNow() {
  const el = scrollRef.current;
  if (!el) return;
 const r = calcVisibleRange(el, displayRows.length);
  visibleRangeRef.current = r;
  setVisibleRange(r);
}

function scrollToTailData() {
  // ✅ “스크롤만” 하면 현재 rows가 빈 행 위주일 때 그대로 빈 행 지옥을 보여줌
  // ✅ tailData를 다시 로드한 뒤, 그 기준으로 스크롤 위치를 잡는다
  void (async () => {
    try {
      await loadTailPage();
    } catch {
      // ignore
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;

        const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
        // 마지막 데이터가 화면 중간~하단에 오도록 약간 위로
        el.scrollTop = Math.max(0, maxTop - Math.floor(el.clientHeight * 0.6));

        updateVisibleRangeNow();
      });
    });
  })();
}

   async function refreshVisibleRowsFromServer() {
  const curRows =
    displayRowsRef.current && displayRowsRef.current.length
      ? displayRowsRef.current
      : rowsRef.current;

  const vr = visibleRangeRef.current;

  if (!curRows.length) return;

  const start = Math.max(0, vr.start);
  const end = Math.min(curRows.length - 1, vr.end);

  const ids = curRows.slice(start, end + 1).map((r) => r.id);
  if (!ids.length) return;

  const r = await fetch(`/api/unified?ids=${ids.join(",")}`, { cache: "no-store" });
  const fresh: UnifiedRow[] = await r.json();

  const map = new Map<number, UnifiedRow>();
  fresh.forEach((x) => map.set(x.id, x));

  // 변경이 "있을 때만" setRows 수행 (불필요 렌더/스페이서 흔들림/점멸 방지)
  setRows((prev) => {
    let changed = false;

    const next = prev.map((row) => {
      const f = map.get(row.id);
      if (!f) return row;

      const nextSortKey = f.sort_key ?? row.sort_key;
      const nextData = (f.data ?? row.data) as Record<string, any>;

      const sortKeySame = (row.sort_key ?? null) === (nextSortKey ?? null);
      const dataSame = shallowEqualRecord(row.data ?? {}, nextData ?? {});

      if (sortKeySame && dataSame) return row;

      changed = true;
      return {
        ...row,
        sort_key: nextSortKey,
        data: nextData,
      };
    });

    return changed ? next : prev;
  });
}
    
      async function loadTailPage() {
  await ensureMinRowsInDb();
  const r = await fetch(`/api/unified?tailData=1&limit=${PAGE_SIZE}`, {
    cache: "no-store",
  });
  const j = await r.json();

  const data: UnifiedRow[] = j?.rows ?? [];
  const nextTotal = Number(j?.total ?? data.length);
  const nextBase = Number(j?.baseIndex ?? 1);

  setRows(data);
  setTotalCount(nextTotal);
  setBaseIndex(nextBase);

  // ref도 즉시 동기화
  rowsRef.current = data;
  totalCountRef.current = nextTotal;
  baseIndexRef.current = nextBase;
} 

    /* --------------------- 소켓 연결 --------------------- */

    // 안정화: 사용자 입력이 있는 동안에는 원격 업데이트 reload를 미룬다
    useEffect(() => {
      const onAny = () => markUserAction();

      window.addEventListener("keydown", onAny, true);
      window.addEventListener("mousedown", onAny, true);
      window.addEventListener("wheel", onAny, true);
      window.addEventListener("touchstart", onAny, true);

      return () => {
        window.removeEventListener("keydown", onAny, true);
        window.removeEventListener("mousedown", onAny, true);
        window.removeEventListener("wheel", onAny, true);
        window.removeEventListener("touchstart", onAny, true);
      };
    }, []);

     useEffect(() => {
  const stop = syncListen(() => {
    // ✅ 내가 방금 emit한 이벤트(내 저장/삭제/붙여넣기 echo)는 무시해서
    //    입력/삭제 직후 화면 덮어쓰기(점멸/복구)를 줄인다
    const dt = Date.now() - lastLocalUnifiedEmitAtRef.current;
    if (dt >= 0 && dt < IGNORE_SELF_ECHO_MS) return;

    requestApplyRemoteSync();
  });

  return () => {
    stop();
    if (remoteSyncTimerRef.current) {
      clearTimeout(remoteSyncTimerRef.current);
      remoteSyncTimerRef.current = null;
    }
    remoteSyncPendingRef.current = false;
  };
}, []);

    /* --------------------- 최초 로딩 --------------------- */

   useEffect(() => {
      function onResize() {
        updateVisibleRangeNow();
      }
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, [rows.length]);

    useEffect(() => {
      (async () => {
        await loadTailPage();
        requestAnimationFrame(() => {
          updateVisibleRangeNow();
        });
      })();
    }, []);

        useEffect(() => {
      if (!rows.length) return;
      if (didInitialScrollRef.current) return;

      didInitialScrollRef.current = true;

      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight / 2);
      });
    }, [rows.length]);

      // 가상스크롤: rows가 로드되면 현재 뷰포트에 맞게 visibleRange를 즉시 계산
    useEffect(() => {
      if (!rows.length) return;
      requestAnimationFrame(() => {
        updateVisibleRangeNow();
      });
    }, [rows.length]);

    /* --------------------- reload --------------------- */
       async function reload() {
      await loadTailPage();
    }

        const isPagingRef = useRef(false);
        const suspendScrollLoadRef = useRef(false);

   function suspendScrollLoadBriefly() {
      suspendScrollLoadRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          suspendScrollLoadRef.current = false;
        });
      });
    }
      
    function getCursorFromFirstRow() {
      const first = rows[0];
      if (!first) return null;
      return {
        sortKey: Number(first.sort_key ?? 0),
        id: Number(first.id),
      };
    }

    function getCursorFromLastRow() {
      const last = rows[rows.length - 1];
      if (!last) return null;
      return {
        sortKey: Number(last.sort_key ?? 0),
        id: Number(last.id),
      };
    }

    async function loadPrevPage() {
      if (isPagingRef.current) return;
      const cur = getCursorFromFirstRow();
      if (!cur) return;
      if (baseIndex <= 1) return; // 더 위가 없음

      isPagingRef.current = true;
      try {
        const el = scrollRef.current;
        const prevScrollHeight = el?.scrollHeight ?? 0;

        const r = await fetch(
          `/api/unified?beforeSortKey=${cur.sortKey}&beforeId=${cur.id}&limit=${PAGE_SIZE}`,
          { cache: "no-store" }
        );
        const j = await r.json();
        const newRows: UnifiedRow[] = j?.rows ?? [];
        if (!newRows.length) return;

        setTotalCount(Number(j?.total ?? totalCount));
        setBaseIndex(Number(j?.baseIndex ?? baseIndex));

        setRows((prev) => {
          const merged = [...newRows, ...prev];
          // 하단을 잘라서 DOM 과부하 방지
          if (merged.length > WINDOW_MAX_ROWS) {
            return merged.slice(0, WINDOW_MAX_ROWS);
          }
          return merged;
        });

        // prepend 후 화면 튐 방지(현재 보던 위치 유지)
        suspendScrollLoadRef.current = true;
        requestAnimationFrame(() => {
          const el2 = scrollRef.current;
          if (!el2) {
            suspendScrollLoadRef.current = false;
            return;
          }
          const newScrollHeight = el2.scrollHeight;
          const delta = newScrollHeight - prevScrollHeight;
          if (delta > 0) el2.scrollTop += delta;

          // 스크롤 조정 직후 onScroll로 연쇄 로드되는 것 방지 (1프레임 뒤 해제)
          requestAnimationFrame(() => {
            suspendScrollLoadRef.current = false;
          });
        });  
      } finally {
        isPagingRef.current = false;
      }
    }

    async function loadNextPage() {
      if (isPagingRef.current) return;
      const cur = getCursorFromLastRow();
      if (!cur) return;

      // 현재 window가 전체의 끝에 도달했는지 대략 체크
      const lastGlobalIndex = baseIndex + rows.length - 1;
      if (totalCount > 0 && lastGlobalIndex >= totalCount) return;

      isPagingRef.current = true;
      try {
        const r = await fetch(
          `/api/unified?afterSortKey=${cur.sortKey}&afterId=${cur.id}&limit=${PAGE_SIZE}`,
          { cache: "no-store" }
        );
        const j = await r.json();
        const newRows: UnifiedRow[] = j?.rows ?? [];
        if (!newRows.length) return;

        setTotalCount(Number(j?.total ?? totalCount));

        setRows((prev) => {
          let merged = [...prev, ...newRows];

          // 상단을 잘라서 DOM 과부하 방지 (잘라낸 만큼 baseIndex 증가)
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
    
    /* --------------------- 외부에서 행 추가 호출 --------------------- */
   async function appendBlankRows(count: number) {
      if (count <= 0) return;

      await fetch("/api/unified/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, beforeId: null, afterId: null }),
      });

            lastLocalUnifiedEmitAtRef.current = Date.now();
      syncEmitUnifiedUpdate();
      await reload();
    }

// ✅ (추가) 칼라 적용: 선택 셀 범위 기준으로 __cellStyle 저장(bulk-patch)
async function applyColorToSelection(color: UnifiedSoftColor, mode: ColorApplyMode) {
  if (!selectedCellRange) return;

  const updates = buildUnifiedColorBulkPatch({
    rows: displayRows,
    viewColumns,
    range: selectedCellRange,
    color,
    mode,
  });

  if (!updates.length) return;

  // 로컬 반영(rows는 원본, id 기준으로 갱신)
  setRows((prev) => {
    const styleById = new Map<number, any>();
    for (const u of updates) styleById.set(u.id, (u.patch as any).__cellStyle);

    return prev.map((r) => {
      const nextStyle = styleById.get(r.id);
      if (!nextStyle) return r;
      return { ...r, data: { ...r.data, __cellStyle: nextStyle } };
    });
  });

    await fetch(`/api/unified/bulk-patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });

  lastLocalUnifiedEmitAtRef.current = Date.now();
  syncEmitUnifiedUpdate();
}

  useImperativeHandle(
  ref,
  () => ({
    appendBlankRows,
    applyColorToSelection,
    scrollToTailData,
  }),
  [displayRows, selectedCellRange, viewColumns]
);  

    /* --------------------- 로컬 셀 값 반영 --------------------- */
function freezeDisplayRowsIfNeeded() {
  if (displayRowsFrozen) return;
  // ✅ 현재 화면에 보이는 목록 그대로 고정해야 커서/선택/인덱스가 안 틀어짐
  setDisplayRowsFrozen(displayRows);
}

function unfreezeDisplayRows() {
  if (!displayRowsFrozen) return;
  setDisplayRowsFrozen(null);
}

// 편집 중 스냅샷에도 동일하게 값 반영(화면 값이 안 바뀌는 것처럼 보이는 문제 방지)
function updateFrozenRow(id: number, key: string, value: string) {
  if (!displayRowsFrozen) return;
  setDisplayRowsFrozen((prev) => {
    if (!prev) return prev;
    return prev.map((r) => (r.id === id ? { ...r, data: { ...r.data, [key]: value } } : r));
  });
}

// ✅ 누락되어 빌드가 깨진 함수: 로컬 rows(+ frozen snapshot) 둘 다 갱신
function updateLocalCell(id: number, key: string, value: string) {
  setRows((prev) =>
    prev.map((r) => (r.id === id ? { ...r, data: { ...(r.data ?? {}), [key]: value } } : r))
  );

  // 필터/정렬 편집 중 스냅샷도 같이 갱신(화면 값 “안 바뀌는 것처럼” 보이는 문제 방지)
  updateFrozenRow(id, key, value);
}

    /* --------------------- 셀 저장 --------------------- */
      async function saveCell(id: number, key: string, value: string) {
  // ✅ "상태"는 파생 표시이므로 DB에 저장/수정하지 않음
  // ✅ "총연장횟수"는 파생 표시이므로 DB에 저장/수정하지 않음
  // ✅ "안내분류"는 거래처↔안내분류 매핑(패널)로만 관리하므로 그리드 저장 차단
  if (key === "상태" || key === "총연장횟수" || key === "안내분류" || isExtensionKey(key)) return;

  // ✅ 내 저장으로 발생하는 unified:update echo 무시용
  lastLocalUnifiedEmitAtRef.current = Date.now();

  await syncPatch(id, key, value);
}

    /* --------------------- 포커스 시 락 획득 --------------------- */
    async function handleFocus(
      rowId: number,
      key: string,
      initialValue: string,
      e: any
    ) {
      const seq = ++focusSeqRef.current;

      // 락 획득 전이라도 편집중 표시 + draft 세팅(빠른 입력 유실/튕김 방지)
      editingCellRef.current = { rowId, key };
      setActiveEditCell({ rowId, key });
      setActiveEditValue(initialValue ?? "");

            const p = acquireLock("unified", rowId);
      lockPendingRef.current[rowId] = p;

      const result = await p;

      // 완료되면 pending 해제
      lockPendingRef.current[rowId] = null;

      // 포커스가 이미 다른 셀로 이동한 경우(경쟁 상태) 처리
      const stillActive =
        focusSeqRef.current === seq &&
        editingCellRef.current?.rowId === rowId &&
        editingCellRef.current?.key === key;

      if (!stillActive) {
        if (result.ok) {
          await releaseLock("unified", rowId);
        }
        return;
      }

      if (result.ok) {
        myRowLocksRef.current[rowId] = true; // ✅ 즉시 기록
        setMyRowLocks((prev) => ({ ...prev, [rowId]: true }));
        return;
      }

      // 락 실패: 편집 상태/드래프트 정리
      editingCellRef.current = null;
      setActiveEditCell(null);
      setActiveEditValue("");

      if (result.reason === "locked_by_other" && (result as any).lock) {
        const lock = (result as any).lock;
        alert(`${lock.locked_by_name}님이 이 행을 편집 중입니다.`);
      } else if (result.reason === "unauthorized") {
        alert("로그인이 만료되었거나 권한이 없습니다. 다시 로그인해 주세요.");
      } else {
        alert("이 행을 편집할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }

      e.target.blur();
      scheduleReload(120);
    }

    /* --------------------- 행 헤더 선택 드래그 --------------------- */

    function handleRowHeaderMouseDown(
      rowIndex: number,
      e: React.MouseEvent<HTMLTableCellElement>
    ) {
      if (e.button !== 0) return; // 좌클릭만
      setIsRowDragging(true);
      setRowDragAnchor(rowIndex);
      setSelectedRowRange({ start: rowIndex, end: rowIndex });
      // 행 헤더 클릭하면 셀 선택은 초기화
      setSelectedCellRange(null);
      setRowContextMenu(null);
    }

    function handleRowHeaderMouseEnter(rowIndex: number) {
      if (!isRowDragging || rowDragAnchor === null) return;

      const start = rowDragAnchor;
      const end = rowIndex;
      if (start <= end) {
        setSelectedRowRange({ start, end });
      } else {
        setSelectedRowRange({ start: end, end: start });
      }
    }

    // 드래그 중 자동 스크롤 + 마우스 위치 기준으로 선택 업데이트
    useEffect(() => {
      function handleMouseMove(e: MouseEvent) {
        if (!isRowDragging || !scrollRef.current) return;

        const container = scrollRef.current;
        const rect = container.getBoundingClientRect();
        const margin = 40;
        const speed = 20;

        if (e.clientY > rect.bottom - margin) {
          container.scrollTop += speed;
        } else if (e.clientY < rect.top + margin) {
          container.scrollTop -= speed;
        }

        const el = document.elementFromPoint(
          e.clientX,
          e.clientY
        ) as HTMLElement | null;
        if (!el || rowDragAnchor === null) return;

        let td: HTMLElement | null = el;
        while (td && td.tagName !== "TD") {
          td = td.parentElement;
        }
        if (!td) return;

        const indexAttr = td.getAttribute("data-row-index");
        if (indexAttr == null) return;

        const rowIndex = Number(indexAttr);
        if (Number.isNaN(rowIndex)) return;

        const start = rowDragAnchor;
        const end = rowIndex;
        if (start <= end) {
          setSelectedRowRange({ start, end });
        } else {
          setSelectedRowRange({ start: end, end: start });
        }
      }

      window.addEventListener("mousemove", handleMouseMove);
      return () => window.removeEventListener("mousemove", handleMouseMove);
    }, [isRowDragging, rowDragAnchor]);

    useEffect(() => {
      function handleWindowMouseUp() {
        setIsRowDragging(false);
        setRowDragAnchor(null);
        setIsCellDragging(false);
        setCellDragAnchor(null);
      }
      window.addEventListener("mouseup", handleWindowMouseUp);
      return () => window.removeEventListener("mouseup", handleWindowMouseUp);
    }, []);

    function isRowSelected(rowIndex: number) {
      if (!selectedRowRange) return false;
      return (
        rowIndex >= selectedRowRange.start && rowIndex <= selectedRowRange.end
      );
    }

    /* --------------------- 셀 범위 선택 유틸 --------------------- */

    function setCellRangeByPoints(r1: number, c1: number, r2: number, c2: number) {
      const startRow = Math.max(0, Math.min(r1, r2));
      const endRow = Math.min(displayRows.length - 1, Math.max(r1, r2));
      const startCol = Math.max(0, Math.min(c1, c2));
      const endCol = Math.min(viewColumns.length - 1, Math.max(c1, c2));

      // 셀 범위만 관리 (행 선택과 분리)
      setSelectedCellRange({ startRow, endRow, startCol, endCol });
    }

    function handleCellMouseDown(
      rowIndex: number,
      colIndex: number,
      e: React.MouseEvent<HTMLTableCellElement>
    ) {
      if (e.button !== 0) return; // 좌클릭만

            setIsCellDragging(true);
      setCellDragAnchor({ row: rowIndex, col: colIndex });
      setCellRangeByPoints(rowIndex, colIndex, rowIndex, colIndex);

      // ★ 셀을 선택하면 행 선택 표시(파란 줄)는 해제되어야 함
      setSelectedRowRange(null);

      setRowContextMenu(null);
    }

   function handleCellMouseEnter(rowIndex: number, colIndex: number) {
      // ✅ hover 표시 갱신(드래그 중이 아니어도 동작)
      setHoveredCell({ row: rowIndex, col: colIndex });

      // 기존 드래그 범위 선택 로직은 그대로 유지
      if (!isCellDragging || !cellDragAnchor) return;
      setCellRangeByPoints(cellDragAnchor.row, cellDragAnchor.col, rowIndex, colIndex);
    }

    function handleCellMouseLeave(rowIndex: number, colIndex: number) {
      // 현재 hover 중인 셀에서 벗어날 때만 해제(불필요한 깜빡임 방지)
      setHoveredCell((prev) => {
        if (!prev) return prev;
        if (prev.row === rowIndex && prev.col === colIndex) return null;
        return prev;
      });
    }

    function handleCellContextMenu(
      rowIndex: number,
      colIndex: number,
      e: React.MouseEvent<HTMLTableCellElement>
    ) {
      e.preventDefault();
      e.stopPropagation();

      // 이미 선택된 셀 범위 안에서 우클릭하면 그대로 유지
      if (
        selectedCellRange &&
        rowIndex >= selectedCellRange.startRow &&
        rowIndex <= selectedCellRange.endRow &&
        colIndex >= selectedCellRange.startCol &&
        colIndex <= selectedCellRange.endCol
      ) {
        // keep selection
      } else {
        // 범위 밖에서 우클릭하면 해당 셀만 새로 선택
        setCellRangeByPoints(rowIndex, colIndex, rowIndex, colIndex);
      }

      // 셀 기반 메뉴이므로 행 선택은 초기화, 모드는 "cell"
      setSelectedRowRange(null);
      setContextMenuMode("cell");
      setRowContextMenu({ x: e.clientX, y: e.clientY });
    }

    function isCellSelected(rowIndex: number, colIndex: number) {
      if (!selectedCellRange) return false;
      const { startRow, endRow, startCol, endCol } = selectedCellRange;
      return (
        rowIndex >= startRow &&
        rowIndex <= endRow &&
        colIndex >= startCol &&
        colIndex <= endCol
      );
    }

    /* --------------------- 선택된 행 범위 유틸 --------------------- */

    function getSelectedRowRangeInfo() {
  if (!selectedRowRange)
    return { start: 0, end: -1, slice: [] as UnifiedRow[] };
  const { start, end } = selectedRowRange;
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(displayRows.length - 1, end);
  return {
    start: safeStart,
    end: safeEnd,
    slice: displayRows.slice(safeStart, safeEnd + 1),
  };
}

    /* --------------------- 행 컨텍스트 메뉴 --------------------- */

    function handleRowHeaderContextMenu(
      rowIndex: number,
      e: React.MouseEvent<HTMLTableCellElement>
    ) {
      e.preventDefault();
      e.stopPropagation();

      if (!isRowSelected(rowIndex)) {
        setSelectedRowRange({ start: rowIndex, end: rowIndex });
      }
      setSelectedCellRange(null);
      setContextMenuMode("row");
      setRowContextMenu({ x: e.clientX, y: e.clientY });
    }

    useEffect(() => {
      function handleClick() {
        setRowContextMenu(null);
      }
      function handleKey(e: KeyboardEvent) {
        if (e.key === "Escape") setRowContextMenu(null);
      }
      window.addEventListener("click", handleClick);
      window.addEventListener("keydown", handleKey);
      return () => {
        window.removeEventListener("click", handleClick);
        window.removeEventListener("keydown", handleKey);
      };
    }, []);

        // 선택 영역이 있을 때 Delete 키로 "내용 지우기" 실행 (편집 draft가 화면에 남는 문제 방지)
    useEffect(() => {
      function onKeyDown(e: KeyboardEvent) {
        if (e.key !== "Delete") return;
        if ((e as any).isComposing) return;

        // 1) 선택 범위가 있으면: 기존대로 범위 지우기
        if (selectedCellRange || selectedRowRange) {
          e.preventDefault();
          e.stopPropagation();

          // ★ 현재 편집 draft가 첫 셀에 남아서 "안 지워진 것처럼 보이는" 현상 방지
          editingCellRef.current = null;
          setActiveEditCell(null);
          setActiveEditValue("");

          // ✅ draft가 남아있으면 “안 지워진 것처럼” 보일 수 있으므로 함께 정리
          setDraftByCell({});

          // 포커스가 input에 있으면 blur로 기본 입력/커서 상태 정리
          const el = document.activeElement as HTMLElement | null;
          if (el && el.tagName === "INPUT") el.blur();

          void handleClearSelectedRows();
          return;
        }

        // 2) 선택 범위가 없으면: 현재 포커스된 셀 1개를 “통째로” 지우기(엑셀 동작)
        const el = document.activeElement as HTMLElement | null;
        if (!el || el.tagName !== "INPUT") return;

        const input = el as HTMLInputElement;
        const rStr = input.getAttribute("data-row");
        const cStr = input.getAttribute("data-col");
        if (rStr == null || cStr == null) return;

        const rowIndex = Number(rStr);
        const colIndex = Number(cStr);
        if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return;

        const row = displayRowsRef.current?.[rowIndex];
        const colKey = viewColumns?.[colIndex];
        if (!row || !colKey) return;

        // 표시 전용 컬럼은 무시
        if (
          colKey === "상태" ||
          colKey === "총연장횟수" ||
          colKey === "안내분류" ||
          isExtensionKey(colKey)
        )
          return;

        e.preventDefault();
        e.stopPropagation();

        // 현재 셀만 빈 문자열로 만든 뒤, blur로 onBlur 저장 흐름을 확실히 태움
        const dk = draftKey(row.id, colKey);
        setDraftByCell((prev) => ({ ...prev, [dk]: "" }));
        setActiveEditCell({ rowId: row.id, key: colKey });
        setActiveEditValue("");

        // ✅ 렌더 반영 후 blur로 저장 흐름 태움
                  requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try {
              input.blur();
            } catch {
              // ignore
            }
          });
        });
      }

      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [selectedCellRange, selectedRowRange, viewColumns, filterMode, filterFrozenIds, sortState]);       

   // Ctrl/Cmd+C: 복사만 keydown에서 처리 (V는 paste 이벤트에서 처리)
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
          void handleCopySelectedRowsToClipboard();
          return;
        }

        // key === "v" 는 여기서 막지 않는다(막으면 아예 paste가 취소될 수 있음)
      }

      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [selectedCellRange, selectedRowRange]); 

      // Ctrl+V/우클릭 붙여넣기 등 모든 paste를 캡처 단계에서 가로채서
    // 선택 범위 기준 TSV 분배 입력 (native paste 한 셀 몰빵 방지)
    useEffect(() => {
      function onPasteCapture(e: ClipboardEvent) {
        const hasRange = !!selectedCellRange || !!selectedRowRange;
        if (!hasRange) return; // 범위 없으면 기본 paste 허용(기존 input 동작)

        const text = e.clipboardData?.getData("text/plain") ?? "";
        if (!text) return;

        e.preventDefault();
        e.stopPropagation();

               // ★ paste 시작 즉시 suppress + 예약된 reload 취소(중요)
        suppressReloadFor(1500);

        // 편집 draft 정리(화면 잔상 방지)
        editingCellRef.current = null;
        setActiveEditCell(null);
        setActiveEditValue("");

        // blur를 해버리면 onBlur 저장/emit이 추가로 발생해서 reload 타이밍이 꼬일 수 있음
        // (native paste는 이미 preventDefault로 막혔으니 blur 불필요)
        void pasteTextToSelectedRange(text); 
      }

      window.addEventListener("paste", onPasteCapture, true); // capture
      return () => window.removeEventListener("paste", onPasteCapture, true);
    }, [selectedCellRange, selectedRowRange, rows, viewColumns]);
         
    /* --------------------- 행 삽입 (선택 범위 위치에 N행, 완전 빈행) --------------------- */

     async function handleInsertRows() {
  let { start, end, slice } = getSelectedRowRangeInfo(); // displayRows 기준

  if (!slice.length) {
    setRowContextMenu(null);
    return;
  }

  const N = Math.max(1, end - start + 1);

  // ✅ displayRows 기준으로 before/after id 계산
  const beforeId = start > 0 ? displayRows[start - 1]?.id ?? null : null;
  const afterId = displayRows[start]?.id ?? null;

  const insRes = await fetch("/api/unified/insert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: N, beforeId, afterId }),
  });

  const insJson = await insRes.json();
  const insertedRows = (insJson?.insertedRows ?? []) as { id: number; sort_key: number }[];

  // ✅ 필터/정렬 중에는 인덱스 꼬임 위험이 크므로 로컬 splice 하지 말고 reload로만 반영
    if (filterMode || (sortState && sortState.key)) {
    suppressReloadFor(2500);
    lastLocalUnifiedEmitAtRef.current = Date.now();
    syncEmitUnifiedUpdate();
    setRowContextMenu(null);
    await reload();
    return;
  }

  // ✅ 평상시(필터/정렬 없음)에는 기존처럼 로컬 즉시 반영(단, insertAt은 id로 찾기)
  suspendScrollLoadBriefly();

  if (insertedRows.length) {
    setRows((prev) => {
      const next = [...prev];
      const insertAt =
        afterId != null ? Math.max(0, next.findIndex((r) => r.id === afterId)) : 0;

      const blanks: UnifiedRow[] = insertedRows.map((x) => ({
        id: Number(x.id),
        sort_key: Number(x.sort_key),
        data: {},
      }));

      const safeAt = insertAt < 0 ? 0 : Math.min(insertAt, next.length);
      next.splice(safeAt, 0, ...blanks);

      if (next.length > WINDOW_MAX_ROWS) return next.slice(0, WINDOW_MAX_ROWS);
      return next;
    });

    // ✅ 맨 앞에 삽입된 경우에만 baseIndex 보정
if (afterId != null) {
  setRows((prev) => {
    const insertAt = prev.findIndex((r) => r.id === afterId);
    if (insertAt === 0) setBaseIndex((b) => Math.max(1, b - insertedRows.length));
    return prev;
  });
} else {
  setBaseIndex((b) => Math.max(1, b - insertedRows.length));
}

    setTotalCount((t) => t + insertedRows.length);
  }

  suppressReloadFor(2500);
  lastLocalUnifiedEmitAtRef.current = Date.now();
  syncEmitUnifiedUpdate();
  setRowContextMenu(null);
}

    /* --------------------- 셀 포커스 이동 유틸 --------------------- */

    function focusCell(rowIndex: number, colIndex: number) {
      const selector = `input[data-row="${rowIndex}"][data-col="${colIndex}"]`;
      const el = document.querySelector<HTMLInputElement>(selector);
      if (el) {
        el.focus();
        el.select();
        return true;
      }
      return false;
    }

    function handleCellKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  rowIndex: number,
  colIndex: number
) {
  let targetRow = rowIndex;
  let targetCol = colIndex;

  switch (e.key) {
    case "ArrowDown": {
  if (rowIndex >= displayRows.length - 1) return;
  targetRow = rowIndex + 1;
  break;
}
case "ArrowUp": {
  if (rowIndex <= 0) return;
  targetRow = rowIndex - 1;
  break;
}
    case "ArrowRight": {
      if (colIndex < viewColumns.length - 1) {
        targetCol = colIndex + 1;
     } else {
  if (rowIndex >= displayRows.length - 1) return;
  targetRow = rowIndex + 1;
  targetCol = 0;
}
      break;
    }
    case "ArrowLeft": {
      if (colIndex > 0) {
        targetCol = colIndex - 1;
      } else {
        if (rowIndex <= 0) return;
        targetRow = rowIndex - 1;
        targetCol = viewColumns.length - 1;
      }
      break;
    }
    default:
      return;
  }

  if (focusCell(targetRow, targetCol)) {
    e.preventDefault();

    // ✅ 키보드 이동 시 하늘색 선택 표시도 커서 따라가게 동기화
    setSelectedRowRange(null);
    setCellRangeByPoints(targetRow, targetCol, targetRow, targetCol);

    // (선택) 붙여넣기 후 포커스 복귀 기준도 최신으로 갱신
    lastFocusForPasteRef.current = { rowIndex: targetRow, colIndex: targetCol };
  }
}

    /* --------------------- 행 삭제 --------------------- */
      
   async function handleDeleteSelectedRows() {
      const { slice } = getSelectedRowRangeInfo();
      if (!slice.length) {
        setRowContextMenu(null);
        return;
      }

      const ids = slice.map((r) => r.id);

      await fetch(`/api/unified/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

           // 로컬에 즉시 반영(체감 속도 향상) + 점프 방지
      suspendScrollLoadBriefly();

      const idSet = new Set(ids);

      setRows((prev) => {
        // 화면의 "맨 위"부터 연속해서 삭제된 개수만큼 baseIndex를 앞으로 당겨야 행번호가 맞음
        let removedFromTop = 0;
        while (removedFromTop < prev.length && idSet.has(prev[removedFromTop].id)) {
          removedFromTop++;
        }
        if (removedFromTop > 0) setBaseIndex((b) => b + removedFromTop);

        return prev.filter((r) => !idSet.has(r.id));
      });

      setTotalCount((t) => Math.max(0, t - ids.length));

      // 내 탭이 곧바로 tailData reload 하면서 멈추는 것 방지
      suppressReloadFor(2500);

      lastLocalUnifiedEmitAtRef.current = Date.now();
      syncEmitUnifiedUpdate();
      setRowContextMenu(null);
      setSelectedRowRange(null);  
    }
    
    /* --------------------- 내용 지우기 (셀/행 단위 PATCH) --------------------- */

        async function handleClearSelectedRows() {
      // 1) 셀 범위가 있으면 셀만 지우기
     if (selectedCellRange) {
  const { startRow, endRow, startCol, endCol } = selectedCellRange;

  const updates: { id: number; patch: Record<string, any> }[] = [];

  // displayRows 기준 선택 → id로 rows를 갱신
  const selected = displayRows.slice(startRow, endRow + 1);
  const idSet = new Set(selected.map((r) => r.id));

  setRows((prev) => {
    const next = prev.map((r) => {
      if (!idSet.has(r.id)) return r;

      const newData: Record<string, any> = { ...r.data };
      for (let cIndex = startCol; cIndex <= endCol; cIndex++) {
        const colKey = viewColumns[cIndex];
        if (!colKey) continue;
        if (colKey === "상태" || colKey === "총연장횟수" || colKey === "안내분류" || isExtensionKey(colKey)) continue;
        newData[colKey] = "";
      }

      updates.push({ id: r.id, patch: newData });
      return { ...r, data: newData };
    });

    return next;
  });

  suspendScrollLoadBriefly();

  await fetch(`/api/unified/bulk-patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });

  suppressReloadFor(2500);

  lastLocalUnifiedEmitAtRef.current = Date.now();
  syncEmitUnifiedUpdate();
  setRowContextMenu(null);
  return;
}

      // 2) 셀 범위가 없으면 기존처럼 행 전체 지우기
      const { start, end, slice } = getSelectedRowRangeInfo();
      if (!slice.length) {
        setRowContextMenu(null);
        return;
      }

      const updates: { id: number; patch: Record<string, any> }[] = [];
const ids = slice.map((r) => r.id);
const idSet = new Set(ids);

setRows((prev) =>
  prev.map((r) => {
    if (!idSet.has(r.id)) return r;

    const newData: Record<string, any> = { ...r.data };
    viewColumns.forEach((key) => {
      if (key === "상태" || key === "총연장횟수" || key === "안내분류" || isExtensionKey(key)) return;
      newData[key] = "";
    });

    updates.push({ id: r.id, patch: newData });
    return { ...r, data: newData };
  })
);

suspendScrollLoadBriefly();

        await fetch(`/api/unified/bulk-patch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });

      // 내 탭이 곧바로 tailData reload 하면서 멈추는 것 방지
      suppressReloadFor(2500);

      lastLocalUnifiedEmitAtRef.current = Date.now();
      syncEmitUnifiedUpdate();
      setRowContextMenu(null);
    }

    /* --------------------- 복사 (셀/행 단위, 클립보드) --------------------- */

    async function handleCopySelectedRowsToClipboard() {
      // 1) 셀 범위가 있으면, 그 셀들만 복사
      if (selectedCellRange) {
        const { startRow, endRow, startCol, endCol } = selectedCellRange;

        const lines: string[] = [];
        for (let rIndex = startRow; rIndex <= endRow; rIndex++) {
  const row = displayRows[rIndex];
  if (!row) continue;
          const cells: string[] = [];
          for (let cIndex = startCol; cIndex <= endCol; cIndex++) {
            const colKey = viewColumns[cIndex];
        const v =
  colKey === "상태"
    ? getDerivedStatusForRow(row.data ?? {}).status
    : colKey === "총연장횟수"
    ? String(countExtensionRounds(row.data ?? {}))
    : ((row.data[colKey] ?? "") as string);

cells.push(v);
          }
          lines.push(cells.join("\t"));
        }

        const text = lines.join("\n");

        try {
          await navigator.clipboard.writeText(text);
        } catch (e) {
          console.error(e);
        }

        setRowContextMenu(null);
        return;
      }

      // 2) 셀 범위가 없으면 기존처럼 행 전체 복사
      const { slice } = getSelectedRowRangeInfo();
      if (!slice.length) {
        setRowContextMenu(null);
        return;
      }

      const lines = slice.map((row) =>
  viewColumns
    .map((key) =>
      key === "상태"
        ? getDerivedStatusForRow(row.data ?? {}).status
        : key === "총연장횟수"
        ? String(countExtensionRounds(row.data ?? {}))
        : ((row.data[key] ?? "") as string)
    )
    .join("\t")
);
      const text = lines.join("\n");

      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        console.error(e);
      }

      setRowContextMenu(null);
    }

    /* --------------------- 붙여넣기 (셀/행 단위) --------------------- */

    async function pasteTextToSelectedRange(text: string) {
  let baseRowIndex: number;
  let baseColIndex: number;

  if (selectedCellRange) {
    baseRowIndex = selectedCellRange.startRow;
    baseColIndex = selectedCellRange.startCol;
  } else {
    const { start } = getSelectedRowRangeInfo(); // displayRows 기준
    baseRowIndex = start >= 0 ? start : 0;
    baseColIndex = 0;
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (!lines.length) {
    setRowContextMenu(null);
    return;
  }

  const parsed = lines.map((line) => line.split("\t"));

  // ✅ displayRows 기준으로만 붙여넣기(필터/정렬 중 인덱스 꼬임 방지)
  const targetRows = displayRows.slice(baseRowIndex, baseRowIndex + parsed.length);
  if (!targetRows.length) {
    setRowContextMenu(null);
    return;
  }

  const updates: { id: number; patch: Record<string, any> }[] = [];
  const idSet = new Set(targetRows.map((r) => r.id));

  setRows((prev) =>
    prev.map((r) => {
      if (!idSet.has(r.id)) return r;

      const targetIndex = targetRows.findIndex((x) => x.id === r.id);
      if (targetIndex < 0) return r;

      const srcRow = parsed[targetIndex] ?? [];
      const newData: Record<string, any> = { ...r.data };

      for (let colOffset = 0; colOffset < srcRow.length; colOffset++) {
        const colIndex = baseColIndex + colOffset;
        if (colIndex >= viewColumns.length) break;

        const key = viewColumns[colIndex];
        if (key === "상태" || key === "총연장횟수" || key === "안내분류" || isExtensionKey(key)) continue;

        const v = srcRow[colOffset] ?? "";
        newData[key] = v;
      }

      updates.push({ id: r.id, patch: newData });
      return { ...r, data: newData };
    })
  );

  await fetch(`/api/unified/bulk-patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });

    suppressReloadFor(2500);

  lastLocalUnifiedEmitAtRef.current = Date.now();
  syncEmitUnifiedUpdate();
  setRowContextMenu(null);
}

    async function handlePasteToSelectedRowsFromClipboard() {
      let text = "";
      try {
        text = await navigator.clipboard.readText();
      } catch (e) {
        console.error(e);
        setRowContextMenu(null);
        return;
      }
      if (!text) {
        setRowContextMenu(null);
        return;
      }

      await pasteTextToSelectedRange(text);
    }

    /* --------------------- UI --------------------- */
    if (!rows.length)
      return <div className="text-center text-gray-500 py-10">Loading...</div>;

    return (
            <div
        className="w-full h-full flex flex-col"
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const target = e.target as HTMLElement;

          // ★ 테이블(셀) 안을 클릭한 건 선택/드래그 동작이므로 여기서 선택 초기화하면 안 됨
          if (target.closest("table")) return;

         if (
  target.closest('[data-row-header="1"]') ||
  target.closest('[data-context-menu="1"]') ||
  target.closest('[data-filter-popover="1"]')
)
  return;

setSelectedRowRange(null);
setSelectedCellRange(null);
setRowContextMenu(null);
closeFilterPopover(); 
        }}
      >
         {/* Ctrl+V 붙여넣기 캐처: paste 이벤트를 항상 여기로 받아서 범위 붙여넣기 처리 */}
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
      onPaste={(e) => {
        const hasRange = !!selectedCellRange || !!selectedRowRange;
        if (!hasRange) return;

        const text = e.clipboardData?.getData("text/plain") ?? "";
        if (!text) return;

        e.preventDefault();
        e.stopPropagation();

        editingCellRef.current = null;
        setActiveEditCell(null);
        setActiveEditValue("");

        const el = document.activeElement as HTMLElement | null;
        if (el && el.tagName === "INPUT") (el as HTMLInputElement).blur();

        void (async () => {
          await pasteTextToSelectedRange(text);

          const loc =
            lastFocusForPasteRef.current ??
            (selectedCellRange
              ? { rowIndex: selectedCellRange.startRow, colIndex: selectedCellRange.startCol }
              : null);

          if (loc) {
            setTimeout(() => {
              focusCell(loc.rowIndex, loc.colIndex);
            }, 0);
          }
        })();
      }}
    />

            <div
        ref={scrollRef}
        className="border-t border-x bg-white w-full flex-1 overflow-auto"
        onScroll={(e) => {
          if (suspendScrollLoadRef.current) return;

          const el = e.currentTarget;

          // 가상 스크롤 렌더 범위 갱신
          const r = calcVisibleRange(el, displayRows.length);
          visibleRangeRef.current = r;
          setVisibleRange(r);

          const threshold = 120;

          // ✅ 필터/정렬 모드에서는 페이징 로드로 rows가 바뀌면 화면이 흔들리기 쉬움 → 로드 중지
          const allowPaging = !filterMode && !sortState?.key;
          if (!allowPaging) return;

          // 위로 스크롤해서 상단 근처면 이전 페이지 로드
          if (el.scrollTop <= threshold) {
            void loadPrevPage();
            return;
          }

          // 아래쪽 근처면 다음 페이지 로드
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
            void loadNextPage();
            return;
          }
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
        filterActive ? "bg-white border-slate-300" : "bg-gray-50 border-slate-200"
      }`}
      title="필터"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setFilterColumnKey(c);
        setFilterPopoverAnchor({ x: e.clientX, y: e.clientY });
        setFilterPopoverOpen(true);
        setRowContextMenu(null);
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
                            title="열 넓이(unit). 20=기준, 1=1/20 수준"
                          />
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

                        <tbody>
              {(() => {
                const start = Math.max(0, visibleRange.start);
const end = Math.min(displayRows.length - 1, visibleRange.end);
const visible = displayRows.slice(start, end + 1);

const topH = start * ROW_HEIGHT;
const bottomH = Math.max(0, (displayRows.length - (end + 1)) * ROW_HEIGHT);
                return (
                  <>
                    {topH > 0 && (
                      <tr>
                        <td colSpan={viewColumns.length + 1} style={{ height: topH, padding: 0, border: "none" }} />
                      </tr>
                    )}

                    {visible.map((row, i) => {
                      const rowIndex = start + i; // ★ rows 배열 기준 index 유지
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
                            onMouseDown={(e) => handleRowHeaderMouseDown(rowIndex, e)}
                            onMouseEnter={() => handleRowHeaderMouseEnter(rowIndex)}
                            onContextMenu={(e) => handleRowHeaderContextMenu(rowIndex, e)}
                          >
                            {baseIndex + rowIndex}
                          </td>

    {viewColumns.map((key, colIndex) => {
  const cellSelected = isCellSelected(rowIndex, colIndex);

  const styleInfo = getCellStyleInfo(row.data ?? {}, row.id, key);
  const bgColor = styleInfo?.bg ? (INLINE_PALETTE[styleInfo.bg]?.bg ?? undefined) : undefined;
  const textColor = styleInfo?.fg ? (INLINE_PALETTE[styleInfo.fg]?.text ?? undefined) : undefined;

  // ✅ 연장(1~7차) 셀은 MainView에서 mousedown 캡처로 패널을 띄우므로
  // 그리드의 "선택(bg-blue-200)"이 안 찍히는 케이스가 있음 → hover로 표시 보완
  const isHovered =
    !!hoveredCell &&
    hoveredCell.row === rowIndex &&
    hoveredCell.col === colIndex;

  const dataCellBase =
    "border px-2 py-[3px]" +
    (cellSelected
      ? " bg-blue-200"
      : rowSelected
      ? " bg-blue-50"
      : isHovered && isExtensionKey(key)
      ? " bg-blue-200"
      : " bg-white");

  return (
    <td
      key={key}
      className={dataCellBase}
      style={bgColor ? ({ backgroundColor: bgColor } as React.CSSProperties) : undefined}
      data-row-index={rowIndex}
      data-col-index={colIndex}
      data-col-key={key}
      onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
      onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
      onMouseLeave={() => handleCellMouseLeave(rowIndex, colIndex)}
      onContextMenu={(e) => handleCellContextMenu(rowIndex, colIndex, e)}
    >
      <input
        className={`w-full bg-transparent outline-none text-slate-900 ${
          key === "계약자주소" ? "text-[10.8px]" : "text-[11.6px]"
        }`}
        style={
          key === "상태"
            ? (() => {
                const st = getDerivedStatusForRow(row.data ?? {});
                return st.textColor ? { color: st.textColor } : undefined;
              })()
            : textColor
            ? ({ color: textColor } as React.CSSProperties)
            : undefined
        }
        readOnly={key === "상태" || key === "총연장횟수" || key === "안내분류" || isExtensionKey(key)}
       value={
          key === "상태"
            ? getDerivedStatusForRow(row.data ?? {}).status
            : key === "총연장횟수"
            ? String(countExtensionRounds(row.data ?? {}))
            : (() => {
                const dk = draftKey(row.id, key);
                if (Object.prototype.hasOwnProperty.call(draftByCell, dk)) {
                  return draftByCell[dk] ?? "";
                }
                return row.data[key] ?? "";
              })()
        }
        data-row={rowIndex}
        data-col={colIndex}
                         onFocus={(e) => {
  setSelectedRowRange(null);

  // ✅ 상태/총연장횟수/안내분류/연장은 표시 전용: 락/편집 흐름 진입 금지
  if (key === "상태" || key === "총연장횟수" || key === "안내분류" || isExtensionKey(key)) return;

  // ✅ 편집 시작 시: displayRows 스냅샷 고정(필터/정렬로 행이 튕기는 것 방지)
  freezeDisplayRowsIfNeeded();

  const initial = String(row.data[key] ?? "");

  // ✅ 포커스 순간 draft 초기화(현재 값 기준)
  setDraftByCell((prev) => ({ ...prev, [draftKey(row.id, key)]: initial }));

  handleFocus(row.id, key, initial, e);
}}       

                       onChange={(e) => {
  // ✅ 상태/총연장횟수/안내분류/연장은 표시 전용
  if (key === "상태" || key === "총연장횟수" || key === "안내분류" || isExtensionKey(key)) return;

  const next = e.target.value;

  // ✅ draft가 진짜 source of truth
  setDraftByCell((prev) => ({ ...prev, [draftKey(row.id, key)]: next }));

  // (유지) 다른 로직과 호환을 위해 activeEdit도 같이 유지
  setActiveEditCell({ rowId: row.id, key });
  setActiveEditValue(next);
}}
     
        onPaste={(e) => {
          // ✅ 상태/총연장횟수/안내분류/연장은 표시 전용
          if (key === "상태" || key === "총연장횟수" || key === "안내분류" || isExtensionKey(key)) return;

          if (skipNextNativePasteRef.current) {
            skipNextNativePasteRef.current = false;
          }

          const hasRange = !!selectedCellRange || !!selectedRowRange;
          if (!hasRange) return;

          const text = e.clipboardData?.getData("text/plain") ?? "";
          if (!text) return;

          e.preventDefault();
          e.stopPropagation();
          void pasteTextToSelectedRange(text);
        }}
                   onBlur={async (e) => {
          // ✅ 상태/총연장횟수/안내분류/연장은 표시 전용(저장/락 흐름 없음)
          if (key === "상태" || key === "총연장횟수" || key === "안내분류" || isExtensionKey(key)) return;

          const dk = draftKey(row.id, key);
          const v0 = Object.prototype.hasOwnProperty.call(draftByCell, dk)
            ? (draftByCell[dk] ?? "")
            : (e.target.value as string);

          // ✅ 날짜 컬럼은 저장 시점에만 YYYYMMDD -> YYYY-MM-DD 정규화
          const v = DATE_KEYS.has(key) ? normalizeDateInput(v0) : String(v0 ?? "");
          
          // ✅ stale 방지: 이 onBlur 실행 시점의 락 보유 여부를 로컬 변수로 확정
          let hasLock = !!myRowLocksRef.current[row.id];

          // ✅ blur가 먼저 와도 handleFocus의 락 완료를 잠깐 기다려본다
          if (!hasLock) {
            const pending = lockPendingRef.current[row.id];
            if (pending) {
              const result = await pending.catch(() => null);
              if (result?.ok) {
                hasLock = true;
                myRowLocksRef.current[row.id] = true; // ✅ 즉시 기록
                setMyRowLocks((prev) => ({ ...prev, [row.id]: true }));
              } 
            }
          }

          // ✅ 끝까지 락이 없으면 저장하지 않고 서버값으로 되돌림
         if (!hasLock) {
            editingCellRef.current = null;
            setActiveEditCell(null);
            setActiveEditValue("");

            delete myRowLocksRef.current[row.id]; // ✅ ref도 정리

            setDraftByCell((prev) => {
              const copy = { ...prev };
              delete copy[dk];
              return copy;
            });

            if (pendingReloadRef.current) pendingReloadRef.current = false;

            await refreshVisibleRowsFromServer();
            unfreezeDisplayRows();
            return;
          }

          try {
            // ✅ 저장 직후 소켓 echo/부분재조회가 1~2초 내로 들어오며 점멸하는 케이스 방지
            suppressReloadFor(2500);

            // ✅ rows 반영은 “타이핑 중”이 아니라 “blur 1회”에만(입력 누락/잘림 방지)
            updateLocalCell(row.id, key, v);

            // ✅ 저장(=syncPatch) -> 소켓 emit 포함(실시간 동기화 유지)
            await saveCell(row.id, key, v);
                    } finally {
            await releaseLock("unified", row.id);

            delete myRowLocksRef.current[row.id]; // ✅ ref 먼저 정리

            setMyRowLocks((prev) => {
              const copy = { ...prev };
              delete copy[row.id];
              return copy;
            });

            editingCellRef.current = null;
            setActiveEditCell(null);
            setActiveEditValue("");

            setDraftByCell((prev) => {
              const copy = { ...prev };
              delete copy[dk];
              return copy;
            });

            if (pendingReloadRef.current) {
              pendingReloadRef.current = false;
              await refreshVisibleRowsFromServer();
            }

            unfreezeDisplayRows();
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

                    {bottomH > 0 && (
                      <tr>
                        <td colSpan={viewColumns.length + 1} style={{ height: bottomH, padding: 0, border: "none" }} />
                      </tr>
                    )}
                  </>
                );
              })()}
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
      if (!filterColumnKey || !props.onSortStateChange) return;
      props.onSortStateChange({ key: filterColumnKey, dir: "asc" });
      closeFilterPopover();
    }}
    onSortDesc={() => {
      if (!filterColumnKey || !props.onSortStateChange) return;
      props.onSortStateChange({ key: filterColumnKey, dir: "desc" });
      closeFilterPopover();
    }}
  />
</div>

        </div>

        {rowContextMenu && (
          <div
            className="fixed z-50 bg-white border shadow text-xs"
            style={{ top: rowContextMenu.y, left: rowContextMenu.x }}
            data-context-menu="1"
          >
            {contextMenuMode === "row" && (
              <>
                <button
                  className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                  onClick={handleInsertRows}
                >
                  행 삽입
                </button>
                <button
                  className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                  onClick={handleDeleteSelectedRows}
                >
                  행 삭제
                </button>
                <button
                  className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                  onClick={handleClearSelectedRows}
                >
                  내용 지우기
                </button>
                <button
                  className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                  onClick={handleCopySelectedRowsToClipboard}
                >
                  복사(클립보드)
                </button>
                <button
                  className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                  onClick={handlePasteToSelectedRowsFromClipboard}
                >
                  붙여넣기(클립보드)
                </button>
              </>
            )}

            {contextMenuMode === "cell" && (
              <>
                <button
                  className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                  onClick={handleClearSelectedRows}
                >
                  내용 지우기
                </button>
                <button
                  className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                  onClick={handleCopySelectedRowsToClipboard}
                >
                  복사(클립보드)
                </button>
                <button
                  className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                  onClick={handlePasteToSelectedRowsFromClipboard}
                >
                  붙여넣기(클립보드)
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }
);

export default UnifiedGrid;