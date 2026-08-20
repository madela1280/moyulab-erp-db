// app/unified/components/UnifiedGrid.tsx
/*
⚠️ 수정주의 (UnifiedGrid.tsx)

이 파일은 “통합관리 코어”로 UI + 행락 + 저장 + 실시간반영 + 가상스크롤이 결합됨.
작은 변경도 저장누락/실시간 끊김/점멸/붙여넣기 실패로 이어질 수 있음.

- 락/저장 레이스: 같은 행 A셀→B셀 이동 시 blur가 락/플래그를 지우면 “한칸건너 저장” 재발.
  → getActiveUnifiedRowId() 기반 “같은 행 이동이면 lock 해제/refresh/unfreeze 보류” 로직 유지 필수.
- 실시간 반영 3종 세트: scheduleIdleReload ↔ applyRemoteSyncOnce ↔ refreshVisibleRowsFromServer
  → 편집 중에도 apply는 하되, refreshVisibleRowsFromServer에서 editingRowId 행 덮어쓰기 금지 유지.
- count 변화: 삭제는 reload 금지(점멸 방지), 삽입은 count 증가 시에만 제한적 reload 허용(원격 행삽입 반영).
- 대량작업(붙여넣기/지우기): updates 생성은 setRows 콜백 “밖”에서 계산(콜백 안 push 부작용 금지).

✅ 최근 이슈로 추가된 주의사항(특히 위험)
- 단일 셀 Delete(삭제)는 “UI만 비고 DB에 저장이 안 되는” 치명 케이스가 있었음.
  → 삭제는 반드시 서버 저장이 확정되게(락/blur 경로 누락 시 락 재시도 등) 처리해야 함.
- 거래처분류 같은 “외부 클릭 선택 저장”은 A탭이 사용자 조작 직후 상태라,
  원격/부분반영 게이트(suppress/idle/editing)에 걸리면 B탭이 먼저 보이고 A탭이 늦게 보이는 현상이 생길 수 있음.
- 초기 진입 스크롤은 tailData에 빈행이 섞일 수 있어 scrollHeight 맨 아래가 정답이 아닐 수 있음.
  → “마지막 non-empty row” 기준으로 맞추는 로직 유지.

수정 후 최소 테스트:
A↔B 실시간, 같은 행 연속입력, Ctrl+V bulk-patch 발생, 행삭제 점멸, 행삽입 동기화,
단일 셀 Delete 후 새로고침(DB 반영 확인), 거래처분류 선택 A/B 표시 타이밍 확인, 최초 진입 스크롤 위치 확인.
*/
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
import { acquireLock, releaseLock, getLockStatus, type LockInfo } from "@/global-lock/lock-engine";

// ✅ 컬럼 정의는 외부 파일로 이동(저장/로딩 모듈에서도 공유하기 위함)
import {
  unifiedColumns,
  DEFAULT_COL_WIDTH_UNIT_BY_KEY,
} from "@/unified/columns/unifiedColumns";

import { calcUnifiedStatus } from "@/unified/status/calcUnifiedStatus";
import { useHolidays } from "@/unified/status/useHolidays";
import { useUnifiedStatusTicker } from "@/unified/status/useUnifiedStatusTicker";
import { countExtensionRounds, sumExtensionDaysFromRow } from "@/views/unified/extensions/extensionCompute";
import { computeEndDateFromStartAndTotalDays } from "@/views/unified/extensions/extensionDate";

// ✅ (추가) 통합관리 필터/정렬 UI (심포니 동일 UX)
import ColumnFilterPopover from "@/unified/filter/ColumnFilterPopover";
import {
  getUniqueValuesForColumn,
  getUnifiedFilterValueForColumn,
  isFilterActive,
  type ColumnFilterState,
} from "@/unified/filter/useUnifiedFilter";
import { applyUnifiedSort, type UnifiedSortState } from "@/unified/filter/useUnifiedSort";

// ✅ (추가) 통합관리 칼라
import { buildUnifiedColorBulkPatch } from "@/unified/color/applyUnifiedColor";
import type { UnifiedSoftColor } from "@/unified/color/ColorPopover";
import type { ColorApplyMode } from "@/unified/color/ColorModeToggle";
import { withGuideMigrationLock } from "@/unified/migration-mode/guideMigrationLock";

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

function hasMeaningfulUnifiedRowData(rowData: Record<string, any> | null | undefined) {
  const data = rowData ?? {};

  for (const key of Object.keys(data)) {
    if (key.startsWith("__")) continue;

    const value = data[key];
    if (value === null || value === undefined) continue;
    if (String(value).trim() === "") continue;

    return true;
  }

  return false;
}

type UnifiedGridProps = {
  isColumnEditMode?: boolean;

  // ✅ 초기이관모드: ON일 때 붙여넣은 안내분류 원시값을 행 단위로 고정
  migrationModeEnabled?: boolean;

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

  // ✅ (추가) 검색 강조/이동은 외부에서 계산해서 Grid에는 표시/스크롤만 맡김
  searchMatchedRowIds?: number[];
  searchActiveRowId?: number | null;
  searchActiveColKey?: string | null;
  searchFocusVersion?: number;
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

    // ✅ 같은 행에서 방향키로 셀을 빠르게 연속 이동하면 onBlur(async: 락확인→저장→검증)들이
    //    서로 겹쳐 실행되면서 "방금 지운 값이 되살아남 / 방금 입력한 값이 사라짐"이 간헐적으로 발생했음.
    //    → 행(row.id) 단위로 onBlur의 저장 로직을 순서대로만 실행되게 줄 세운다(값 캡처는 그대로 즉시,
    //      실제 저장 실행 순서만 직렬화). sync-engine/lock-engine/socket 코어는 건드리지 않음.
    const rowSaveQueueRef = useRef<Record<number, Promise<void>>>({});

    function runQueuedForRow(rowId: number, task: () => Promise<void>): Promise<void> {
      const prev = rowSaveQueueRef.current[rowId] ?? Promise.resolve();
      const next = prev.catch(() => {}).then(task);
      rowSaveQueueRef.current[rowId] = next;
      return next;
    }

    // ✅ 다른 사용자가 락을 잡은 행은 계속 입력 차단
    // - 기존 문제: locked_by_other alert가 한 번 뜬 뒤 같은 행 다른 셀은 계속 입력 가능했음
    // - 해결: 락 실패 rowId를 blocked 상태로 저장하고, 해당 행 input을 readOnly 처리
    const blockedRowLocksRef = useRef<Record<number, LockInfo>>({});
    const [blockedRowLocks, setBlockedRowLocks] = useState<Record<number, LockInfo>>({});

    function isLockExpired(lock: LockInfo | null | undefined) {
      if (!lock?.expires_at) return false;
      const t = new Date(lock.expires_at).getTime();
      if (!Number.isFinite(t)) return false;
      return t <= Date.now();
    }

    function setBlockedRowLock(rowId: number, lock: LockInfo) {
      blockedRowLocksRef.current[rowId] = lock;
      setBlockedRowLocks((prev) => ({ ...prev, [rowId]: lock }));
    }

    function clearBlockedRowLock(rowId: number) {
      delete blockedRowLocksRef.current[rowId];
      setBlockedRowLocks((prev) => {
        const copy = { ...prev };
        delete copy[rowId];
        return copy;
      });
    }

 // ✅ 상태 컬럼은 DB 저장값이 아니라 "오늘 기준 파생 표시"로 처리
// - 자정에 자동으로 다시 계산되어 만기 D-5→D-4 같은 변화가 반영됨
const { today } = useUnifiedStatusTicker();

// ✅ 만기3일전(공휴일) 판정용. 실패해도 빈 Set이라 기존 "만기3일전" 표시로 그대로 동작.
const { holidays } = useHolidays();

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
    today,
    holidays
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

// ✅ fetch 레이스 방지(최신 요청만 반영)
// - B탭에서 unified:update가 연속으로 오면 /api/unified?ids=... 재조회가 겹칠 수 있음
// - 늦게 도착한 “이전 응답”이 최신 상태를 덮어써서 일부 셀이 안 바뀐 것처럼 보이는 문제를 막는다.
const visibleRefreshSeqRef = useRef(0);
const visibleRefreshAbortRef = useRef<AbortController | null>(null);

const tailLoadSeqRef = useRef(0);
const tailLoadAbortRef = useRef<AbortController | null>(null);

// full reload(큰 점멸)는 “버스트당 1회”로 제한
const lastFullReloadAtRef = useRef(0);
const FULL_RELOAD_MIN_INTERVAL_MS = 1200;

const lastLocalUnifiedEmitAtRef = useRef<number>(0);
const IGNORE_SELF_ECHO_MS = 1200;

// ✅ meta=count는 비용/렌더 영향이 커서 너무 자주 치면 입력/스크롤이 불안정해질 수 있음
const lastCountCheckAtRef = useRef<number>(0);
const COUNT_CHECK_MIN_INTERVAL_MS = 2500;

function requestApplyRemoteSync() {
  remoteSyncPendingRef.current = true;
  pendingRemoteUpdateRef.current = true;

  if (remoteSyncTimerRef.current) {
    clearTimeout(remoteSyncTimerRef.current);
    remoteSyncTimerRef.current = null;
  }

  // ✅ (Fix) 거래처분류 같은 “클릭 선택(외부 UI 저장)”은
  // A탭이 사용자 조작 직후라 idle 판정에 걸려 화면 반영이 늦고,
  // B탭은 idle이라 먼저 반영되는 역전이 생길 수 있음.
  // → 편집 중이 아니고(safe), suppress/write 중이 아니면 즉시 부분 반영을 1회 시도.
  const isEditing = !!editingCellRef.current;
  const canApplyNow =
    !isEditing &&
    writeInFlightRef.current === 0 &&
    Date.now() >= suppressReloadUntilRef.current;

  if (canApplyNow) {
    // 즉시 1회 시도(부분 반영). 실패/보류 조건은 applyRemoteSyncOnce 내부에서 재판단됨.
    remoteSyncTimerRef.current = setTimeout(() => {
      remoteSyncTimerRef.current = null;
      void applyRemoteSyncOnce();
    }, 0);
    return;
  }

  // 나머지는 기존처럼 idle 기반 반영
  scheduleIdleReload(IDLE_RELOAD_CHECK_MS);
}

// 열이동/열폭: "표시용 UI 상태" (DB/동기화와 무관)
const isColumnEditMode = !!props.isColumnEditMode;
const migrationModeEnabled = !!props.migrationModeEnabled;

// ✅ 붙여넣기 이벤트는 타이밍상 stale closure가 생길 수 있으므로 ref로 최신 ON/OFF 값을 확정 사용
const migrationModeEnabledRef = useRef(false);
migrationModeEnabledRef.current = migrationModeEnabled;

async function applyRemoteSyncOnce() {
  // ✅ 쓰기 작업이 진행 중이면, 원격 적용(fetch)이 먼저 돌아 옛 값으로 덮일 수 있으므로 보류
  if (writeInFlightRef.current > 0) {
    remoteSyncPendingRef.current = true;
    pendingRemoteUpdateRef.current = true;
    scheduleIdleReload(IDLE_RELOAD_CHECK_MS);
    return;
  }

  // ✅ 편집 중이라도 원격 반영은 허용한다.
  //    대신 refreshVisibleRowsFromServer()에서 "현재 편집 중인 행"은 덮어쓰지 않도록 처리한다.

  if (remoteSyncInFlightRef.current) return;

  remoteSyncInFlightRef.current = true;
  try {
    if (!remoteSyncPendingRef.current) return;
    remoteSyncPendingRef.current = false;

    // ✅ (Fix) suppress 기간에도 "가벼운 부분 반영(visible refresh)"은 허용
    // - 거래처분류 같은 외부 클릭 저장은 suppress에 걸려 A탭 표시가 늦어질 수 있음
    // - 대신 count/삽입정합성(rebuild/reload 유발)은 suppress가 끝난 뒤에만 수행
    await refreshVisibleRowsFromServer();

    if (Date.now() < suppressReloadUntilRef.current) {
      remoteSyncPendingRef.current = true;
      pendingRemoteUpdateRef.current = true;
      scheduleIdleReload(IDLE_RELOAD_CHECK_MS);
      return;
    }

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

const searchMatchedRowIds = props.searchMatchedRowIds ?? [];
const searchActiveRowId = props.searchActiveRowId ?? null;
const searchActiveColKey = props.searchActiveColKey ?? null;
const searchFocusVersion = Number(props.searchFocusVersion ?? 0);

const searchMatchedRowIdSet = useMemo(() => {
  const set = new Set<number>();
  for (const id of searchMatchedRowIds) {
    const n = Number(id);
    if (Number.isFinite(n) && n > 0) set.add(n);
  }
  return set;
}, [searchMatchedRowIds]);

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

  function getFilterText(row: UnifiedRow, key: string) {
    if (key === "상태") return String(getDerivedStatusForRow(row.data ?? {}).status ?? "");
    if (key === "총연장횟수") return String(countExtensionRounds(row.data ?? {}));
    return getUnifiedFilterValueForColumn(key, row.data?.[key]);
  }

  let out = rows;

  // filter: 표시값 기준
  if (filterState?.selectedByKey) {
    const entries = Object.entries(filterState.selectedByKey);
    if (entries.length) {
      out = out.filter((row) => {
        for (const [key, selectedSet] of entries) {
          if (!selectedSet || selectedSet.size === 0) continue;
          const v = getFilterText(row, key);
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
      const aHasData = hasMeaningfulUnifiedRowData(a.data);
      const bHasData = hasMeaningfulUnifiedRowData(b.data);

      // ✅ 완전 빈 행은 항상 맨 아래로
      if (aHasData !== bHasData) {
        return aHasData ? -1 : 1;
      }

      const av = getDisplayText(a, k).trim();
      const bv = getDisplayText(b, k).trim();

      // ✅ 정렬 대상 값이 빈칸인 행도 항상 아래로
      const aBlank = av === "";
      const bBlank = bv === "";
      if (aBlank !== bBlank) {
        return aBlank ? 1 : -1;
      }

      const cmp = av.localeCompare(bv, "ko-KR");
      if (cmp !== 0) {
        return dir === "asc" ? cmp : -cmp;
      }

      const aSortKey = Number(a.sort_key ?? 0);
      const bSortKey = Number(b.sort_key ?? 0);
      if (aSortKey !== bSortKey) return aSortKey - bSortKey;

      return Number(a.id) - Number(b.id);
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
  // ✅ 편집 중 freeze는 “목록/순서”만 고정하고, “값”은 최신 rows를 따라간다.
  // 그래야 B탭에서 포커스만 남아도 원격값이 안 보이는 문제가 사라진다.
  if (displayRowsFrozen) {
    const out: UnifiedRow[] = [];
    for (const frozenRow of displayRowsFrozen) {
      const latest = rowsById.get(frozenRow.id);
      out.push(latest ?? frozenRow);
    }
    return out;
  }

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

  if (filterColumnKey === "상태" || filterColumnKey === "총연장횟수") {
    const set = new Set<string>();

    for (const r of rows) {
      if (filterColumnKey === "상태") {
        set.add(String(getDerivedStatusForRow(r.data ?? {}).status ?? ""));
      } else {
        set.add(String(countExtensionRounds(r.data ?? {})));
      }
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko-KR"));
  }

  return getUniqueValuesForColumn(rows, filterColumnKey);
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

useEffect(() => {
  if (!filterMode) return;
  if (!sortState?.key && !filterActive) return;

  requestAnimationFrame(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.scrollTop = 0;
    updateVisibleRangeNow();
  });
}, [filterMode, sortState?.key, sortState?.dir, filterActive]);

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
  const s = String(key ?? "").trim();
  const m = s.match(/^(\d+)차연장$/);
  if (!m) return false;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 && n <= 15;
}

type CellStyleInfo = { bg?: string; fg?: string };

function cellStyleKey(rowId: number, colKey: string) {
  return `${rowId}:${colKey}`;
}

function getActiveUnifiedRowId(): number | null {
  try {
    const ae = document.activeElement as HTMLElement | null;
    if (!ae) return null;

    // input 포커스가 아닌 경우는 행 이동으로 간주
    if (ae.tagName !== "INPUT") return null;

    const tr = ae.closest("tr[data-unified-id]");
    const idAttr = tr?.getAttribute("data-unified-id");
    if (!idAttr) return null;

    const n = Number(idAttr);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
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

  // Excel/구글시트는 끝에 개행이 붙는 경우가 많아서 "마지막 1개"만 제거
  // (중간의 빈 줄은 유지해야 엑셀처럼 행 매핑이 안 깨짐)
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

    // ✅ 드래그 민감도 완화: 클릭/미세 움직임으로 범위가 커지는 것을 방지
    const CELL_DRAG_THRESHOLD_PX = 6;
    const cellDragStartPosRef = useRef<{ x: number; y: number } | null>(null);
    const cellDragMovedRef = useRef(false);

    // ✅ 연장(1~7차) 같은 "클릭이 그리드 선택을 막는" 셀에서도
    // 마우스를 올리면 선택처럼 보이도록 하는 hover 표시용 상태
    const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const didInitialScrollRef = useRef(false); 
    const searchJumpSeqRef = useRef(0);  

    // 편집 중 syncListen이 들어오면 즉시 reload하지 않고 보류(입력 튕김 방지)
    const editingCellRef = useRef<{ rowId: number; key: string } | null>(null);
    const pendingReloadRef = useRef(false);

    // 빠른 입력(락 획득 전 입력 유실) 방지: 활성 셀 draft
    const [activeEditCell, setActiveEditCell] = useState<{
      rowId: number;
      key: string;
    } | null>(null);
    const [activeEditValue, setActiveEditValue] = useState<string>("");

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

    // ✅ 쓰기 작업(bulk-patch/insert/delete 등) 진행 중에는
    //    원격 sync 적용(fetch)이 먼저 돌아서 “옛 값으로 덮이는” 현상이 생길 수 있음
    //    → write-in-flight 동안은 원격 apply를 보류한다.
    const writeInFlightRef = useRef<number>(0);

    function beginWrite() {
      writeInFlightRef.current += 1;
    }

    function endWrite() {
      writeInFlightRef.current = Math.max(0, writeInFlightRef.current - 1);
    }

     // 안정화: 다른 PC/탭에서 온 업데이트로 인해 즉시 reload(대량 렌더)로 멈추는 것 방지
const lastUserActionAtRef = useRef<number>(Date.now());
const pendingRemoteUpdateRef = useRef<boolean>(false);
const idleReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// ✅ 원격 반영(부분 reload) 유휴 판단 기준(너무 길면 “실시간”이 느려 보임)
const IDLE_APPLY_MIN_MS = 700;     // 기존 2500ms → 700ms
const IDLE_RELOAD_CHECK_MS = 250;  // 기존 600ms → 250ms

function markUserAction() {
  lastUserActionAtRef.current = Date.now();
}

    function scheduleIdleReload(checkDelayMs = IDLE_RELOAD_CHECK_MS) {
      if (idleReloadTimerRef.current) clearTimeout(idleReloadTimerRef.current);
      idleReloadTimerRef.current = setTimeout(async () => {
        // 아직 반영할 원격 업데이트가 없으면 종료
        if (!pendingRemoteUpdateRef.current) return;

        // suppress 기간이면 미룸
        if (Date.now() < suppressReloadUntilRef.current) {
          scheduleIdleReload(checkDelayMs);
          return;
        }

         // ✅ 편집 중 여부로 무한 보류하지 않는다.
        //    키보드/마우스 입력은 lastUserActionAtRef로 잡히므로 idleMs 조건으로만 제어한다.

        // 사용자가 최근에 조작했으면 미룸(유휴 상태에서만 reload)
        const idleMs = Date.now() - lastUserActionAtRef.current;
if (idleMs < IDLE_APPLY_MIN_MS) {
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
      // 너무 짧으면 입력/스크롤이 끊기지만, 너무 길면 “실시간 반영” 체감이 떨어짐
      // ✅ 8초는 체감상 너무 길 수 있어 상한을 낮춤
      const effectiveMs = ms >= 2500 ? 3500 : ms;

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

  // ✅ count 변화 처리
  // - 삭제(cnt 감소): full reload 금지(점멸 방지) + total만 갱신
  // - 삽입(cnt 증가): 원격에서 새 행을 발견해야 함
  //   → tail reload 대신 "현재 보이는 anchor 기준 window 재구성" 우선(점멸/멈춤 완화)
  if (cnt !== prevTotal && cnt > 0) {
    totalCountRef.current = cnt;
    setTotalCount(cnt);

    // 삭제(감소)면 여기서 끝
    if (cnt < prevTotal) return;

    const t = Date.now();
    if (t - lastFullReloadAtRef.current < FULL_RELOAD_MIN_INTERVAL_MS) return;
    lastFullReloadAtRef.current = t;

    const rebuilt = await rebuildWindowAroundVisibleAnchor();
    if (rebuilt) return;

    // fallback (필터/정렬 등으로 rebuild 불가 시)
    await reloadPreserveScroll();
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
  // ✅ tailData를 다시 로드한 뒤 “마지막 실제 데이터 행” 기준으로 위치를 잡는다
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

        const currentRows =
          rowsRef.current && rowsRef.current.length ? rowsRef.current : rows;

        let lastDataIndex = -1;
        for (let i = currentRows.length - 1; i >= 0; i--) {
          if (hasMeaningfulUnifiedRowData(currentRows[i]?.data ?? {})) {
            lastDataIndex = i;
            break;
          }
        }

        const targetIndex = lastDataIndex >= 0 ? lastDataIndex : Math.max(0, currentRows.length - 1);
        const desiredTop = Math.max(0, targetIndex * ROW_HEIGHT - Math.floor(el.clientHeight * 0.8));
        const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);

        el.scrollTop = Math.max(0, Math.min(desiredTop, maxTop));
        updateVisibleRangeNow();
      });
    });
  })();
}

function waitForFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function waitForGridRender(frameCount = 2) {
  for (let i = 0; i < frameCount; i++) {
    await waitForFrame();
  }
}

function getDisplayRowIndexById(targetRowId: number) {
  const current =
    displayRowsRef.current && displayRowsRef.current.length
      ? displayRowsRef.current
      : rowsRef.current;

  return current.findIndex((row) => row.id === targetRowId);
}

function getViewColumnIndexByKey(targetColKey: string | null) {
  if (!targetColKey) return -1;
  return viewColumns.indexOf(targetColKey);
}

function findRenderedCellElement(targetRowId: number, targetColKey: string | null) {
  if (!targetColKey) return null;

  const tr = scrollRef.current?.querySelector(
    `tr[data-unified-id="${targetRowId}"]`
  ) as HTMLElement | null;

  if (!tr) return null;

  const cells = Array.from(tr.querySelectorAll("td[data-col-key]")) as HTMLElement[];
  return cells.find((td) => String(td.dataset.colKey ?? "") === targetColKey) ?? null;
}

async function loadWindowAroundRowId(targetRowId: number) {
  const infoRes = await fetch(`/api/unified?ids=${targetRowId}`, { cache: "no-store" });
  if (!infoRes.ok) return false;

  const infoJson = await infoRes.json().catch(() => []);
  const infoRows = Array.isArray(infoJson) ? (infoJson as UnifiedRow[]) : [];
  const targetRow = infoRows[0];

  if (!targetRow?.id) return false;

  const targetSortKey = Number(targetRow.sort_key ?? NaN);
  if (!Number.isFinite(targetSortKey)) return false;

  const SIDE_LIMIT = Math.max(80, Math.floor(PAGE_SIZE / 2));

  const [prevRes, nextRes] = await Promise.all([
    fetch(
      `/api/unified?beforeSortKey=${targetSortKey}&beforeId=${targetRow.id}&limit=${SIDE_LIMIT}`,
      { cache: "no-store" }
    ),
    fetch(
      `/api/unified?afterSortKey=${targetSortKey}&afterId=${targetRow.id}&limit=${SIDE_LIMIT}`,
      { cache: "no-store" }
    ),
  ]);

  const prevJson = prevRes.ok ? await prevRes.json().catch(() => null) : null;
  const nextJson = nextRes.ok ? await nextRes.json().catch(() => null) : null;

  const prevRows: UnifiedRow[] = Array.isArray(prevJson?.rows) ? prevJson.rows : [];
  const nextRows: UnifiedRow[] = Array.isArray(nextJson?.rows) ? nextJson.rows : [];

  const nextWindow = [...prevRows, targetRow, ...nextRows];
  const nextBaseIndex = Number(prevJson?.baseIndex ?? 1);
  const nextTotal = Number(prevJson?.total ?? nextJson?.total ?? totalCountRef.current ?? nextWindow.length);

  setRows(nextWindow);
  setBaseIndex(nextBaseIndex);
  setTotalCount(nextTotal);

  rowsRef.current = nextWindow;
  baseIndexRef.current = nextBaseIndex;
  totalCountRef.current = nextTotal;

  return true;
}

async function moveSearchTargetIntoView(targetRowId: number, targetColKey: string | null) {
  let rowIndex = getDisplayRowIndexById(targetRowId);

  if (rowIndex < 0) {
    const loaded = await loadWindowAroundRowId(targetRowId);
    if (!loaded) return;

    await waitForGridRender(2);
    rowIndex = getDisplayRowIndexById(targetRowId);
  }

  if (rowIndex < 0) return;

  const colIndex = getViewColumnIndexByKey(targetColKey);

  setSelectedRowRange(null);

  if (colIndex >= 0) {
    setCellRangeByPoints(rowIndex, colIndex, rowIndex, colIndex);
    lastFocusForPasteRef.current = { rowIndex, colIndex };
  }

  const el = scrollRef.current;
  if (el) {
    const rowTop = rowIndex * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight;

    if (rowTop < viewTop) {
      el.scrollTop = Math.max(0, rowTop - Math.floor(el.clientHeight * 0.35));
    } else if (rowBottom > viewBottom) {
      el.scrollTop = Math.max(0, rowBottom - Math.floor(el.clientHeight * 0.65));
    }
  }

  await waitForGridRender(2);
  updateVisibleRangeNow();
  await waitForGridRender(1);

  const cellEl = findRenderedCellElement(targetRowId, targetColKey);
  if (cellEl) {
    cellEl.scrollIntoView({
      block: "nearest",
      inline: "center",
    });
  }
}

  async function refreshVisibleRowsFromServer() {
  const curRows =
    displayRowsRef.current && displayRowsRef.current.length
      ? displayRowsRef.current
      : rowsRef.current;

  if (!curRows.length) return;

  // ✅ visibleRangeRef가 스테일일 수 있으므로, 실제 스크롤 위치 기준으로 매번 재계산
  const el = scrollRef.current;
  const vr = el ? calcVisibleRange(el, curRows.length) : visibleRangeRef.current;
  visibleRangeRef.current = vr;

  const start = Math.max(0, vr.start);
  const end = Math.min(curRows.length - 1, vr.end);

  const ids = curRows.slice(start, end + 1).map((r) => r.id);
  if (!ids.length) return;

  // ✅ 레이스 방지: 이전 요청 취소 + 최신 요청만 반영
  const mySeq = ++visibleRefreshSeqRef.current;
  if (visibleRefreshAbortRef.current) {
    try {
      visibleRefreshAbortRef.current.abort();
    } catch {
      // ignore
    }
  }
  const ac = new AbortController();
  visibleRefreshAbortRef.current = ac;

  let fresh: UnifiedRow[] = [];
  try {
    const r = await fetch(`/api/unified?ids=${ids.join(",")}`, {
      cache: "no-store",
      signal: ac.signal,
    });
    fresh = (await r.json()) as UnifiedRow[];
  } catch (e: any) {
    // abort면 조용히 종료
    if (ac.signal.aborted) return;
    throw e;
  }

  // ✅ 더 최신 요청이 이미 시작되었으면(=mySeq가 최신이 아니면) 이번 응답은 버린다.
  if (mySeq !== visibleRefreshSeqRef.current) return;

    // ✅ 요청한 id가 서버 응답에서 빠지면(삭제/삽입 등) full reload 대신 “사라진 id만 제거”
  if (Array.isArray(fresh) && fresh.length !== ids.length) {
    const got = new Set<number>((fresh || []).map((x) => Number((x as any)?.id)));
    const missing = ids.filter((id) => !got.has(id));

    if (missing.length) {
      const missingSet = new Set<number>(missing);

      setRows((prev) => {
        // 상단에서 빠진 개수만큼 baseIndex 보정(스크롤 튐 완화)
        let removedFromTop = 0;
        while (removedFromTop < prev.length && missingSet.has(prev[removedFromTop].id)) {
          removedFromTop++;
        }
        if (removedFromTop > 0) setBaseIndex((b) => b + removedFromTop);

        return prev.filter((r) => !missingSet.has(r.id));
      });

      // ✅ totalCount도 같이 보정(원격 화면 흔들림 완화에 도움)
      setTotalCount((t) => Math.max(0, t - missing.length));
      totalCountRef.current = Math.max(0, totalCountRef.current - missing.length);
    }

    return;
  }

  const map = new Map<number, UnifiedRow>();
  (fresh || []).forEach((x) => map.set(x.id, x));
  const editingRowId = editingCellRef.current?.rowId ?? null;

  // ✅ 최신 응답만 setRows 허용
  setRows((prev) => {
    // setRows가 실행될 때도 “내 응답이 최신인지” 재확인(중간에 tail reload가 끼어드는 경우 방지)
    if (mySeq !== visibleRefreshSeqRef.current) return prev;

    let changed = false;

      const next = prev.map((row) => {
      const f = map.get(row.id);
      if (!f) return row;

      const nextSortKey = f.sort_key ?? row.sort_key;

      // ✅ 편집 중 행도 "전체 skip" 하지 말고,
      // 편집 중인 셀의 값만 보존하고 나머지 필드는 서버값을 반영한다.
      // (거래처분류/안내분류 선택은 편집 중에도 A탭 즉시 보이게 하는 목적)
      const editing = editingCellRef.current;
      const editingKey = editing?.key ?? null;

      const allowOverwriteWhileEditing = new Set(["거래처분류", "안내분류", "기기번호"]);

      let nextData = (f.data ?? row.data) as Record<string, any>;

      if (
        editingRowId != null &&
        row.id === editingRowId &&
        editingKey &&
        !allowOverwriteWhileEditing.has(editingKey)
      ) {
        nextData = {
          ...(nextData ?? {}),
          [editingKey]: (row.data ?? {})[editingKey],
        };
      }

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

  // ✅ 레이스 방지: tail 요청도 겹칠 수 있음(reload 연타/카운트변화/폴백 reload)
  const mySeq = ++tailLoadSeqRef.current;
  if (tailLoadAbortRef.current) {
    try {
      tailLoadAbortRef.current.abort();
    } catch {
      // ignore
    }
  }
  const ac = new AbortController();
  tailLoadAbortRef.current = ac;

  let j: any = null;
  try {
    const r = await fetch(`/api/unified?tailData=1&limit=${PAGE_SIZE}`, {
      cache: "no-store",
      signal: ac.signal,
    });
    j = await r.json();
  } catch (e: any) {
    if (ac.signal.aborted) return;
    throw e;
  }

  // ✅ 더 최신 tail 요청이 이미 시작되었으면 이번 응답은 버린다.
  if (mySeq !== tailLoadSeqRef.current) return;

  const baseRows: UnifiedRow[] = j?.rows ?? [];
  let nextTotal = Number(j?.total ?? baseRows.length);
  const nextBase = Number(j?.baseIndex ?? 1);

  // ✅ (Fix) tailData는 “마지막 데이터 행” 기준이라,
  // 그 뒤에 추가된 빈 행(행10추가/행삽입으로 생성된 빈 행)이 화면에 안 보일 수 있음.
  // → 마지막 데이터 행 이후를 추가로 조회해서 붙인다(엑셀처럼 아래에 빈 행이 보이게).
  const EXTRA_AFTER_ROWS = 250;

  if (baseRows.length) {
    const last = baseRows[baseRows.length - 1];
    const afterSortKey = Number(last.sort_key ?? 0);
    const afterId = Number(last.id ?? 0);

    if (Number.isFinite(afterSortKey) && afterId > 0) {
      try {
        const r2 = await fetch(
          `/api/unified?afterSortKey=${afterSortKey}&afterId=${afterId}&limit=${EXTRA_AFTER_ROWS}`,
          { cache: "no-store", signal: ac.signal }
        );

        if (r2.ok) {
          const j2 = await r2.json().catch(() => null);

          // ✅ 더 최신 tail 요청이 이미 시작되었으면 이번 응답은 버린다.
          if (mySeq !== tailLoadSeqRef.current) return;

          const afterRows: UnifiedRow[] = j2?.rows ?? [];
          if (afterRows.length) {
            const combined = [...baseRows, ...afterRows];
            nextTotal = Number(j2?.total ?? nextTotal);

            setRows(combined);
            setTotalCount(nextTotal);
            setBaseIndex(nextBase);

            // ref도 즉시 동기화
            rowsRef.current = combined;
            totalCountRef.current = nextTotal;
            baseIndexRef.current = nextBase;
            return;
          }
        }
      } catch (e: any) {
        // abort면 조용히 종료
        if (ac.signal.aborted) return;
        // 실패 시 baseRows로 fallback
      }
    }
  }

  setRows(baseRows);
  setTotalCount(nextTotal);
  setBaseIndex(nextBase);

  // ref도 즉시 동기화
  rowsRef.current = baseRows;
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
    // ✅ echo 무시는 “누락”을 만들 수 있어 제거
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

      // ✅ 첫 진입 시: "진짜 마지막 데이터(빈 행 제외)"가 화면 하단 근처에 오도록 스크롤
      // - tailData에는 빈 행이 섞일 수 있어 maxTop 기준 스크롤만 하면 마지막 입력줄이 위로 밀릴 수 있음
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (!el) return;

          // 마지막 "의미있는 값"이 있는 행 찾기(스타일/메타 제외)
          let lastDataIndex = -1;
          for (let i = rows.length - 1; i >= 0; i--) {
            const d = rows[i]?.data ?? {};
            let hasValue = false;
            for (const k of Object.keys(d)) {
              if (k.startsWith("__")) continue; // __cellStyle 등 메타 제외
              const v = (d as any)[k];
              if (v === null || v === undefined) continue;
              if (String(v).trim() === "") continue;
              hasValue = true;
              break;
            }
            if (hasValue) {
              lastDataIndex = i;
              break;
            }
          }

          const targetIndex = lastDataIndex >= 0 ? lastDataIndex : rows.length - 1;

          // target row가 화면 하단(약 80%) 쪽에 오도록
          const desiredTop = Math.max(0, targetIndex * ROW_HEIGHT - Math.floor(el.clientHeight * 0.8));
          const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
          el.scrollTop = Math.max(0, Math.min(desiredTop, maxTop));

          updateVisibleRangeNow();
        });
      });
    }, [rows.length]); 

      // 가상스크롤: rows가 로드되면 현재 뷰포트에 맞게 visibleRange를 즉시 계산
    useEffect(() => {
      if (!rows.length) return;
      requestAnimationFrame(() => {
        updateVisibleRangeNow();
      });
    }, [rows.length]);

        useEffect(() => {
      if (!searchFocusVersion) return;
      if (!searchActiveRowId) return;

      const seq = ++searchJumpSeqRef.current;

      void (async () => {
        await moveSearchTargetIntoView(searchActiveRowId, searchActiveColKey);

        if (seq !== searchJumpSeqRef.current) return;
      })();
    }, [searchFocusVersion, searchActiveRowId, searchActiveColKey]);

    /* --------------------- reload --------------------- */
       async function reload() {
      await loadTailPage();
    }

  // ✅ (Fix #1) count 증가(삽입) 동기화는 필요하지만, 원격 탭에서 tail reload가 점멸/점프를 유발함
// → reload 자체는 하되, 스크롤 로드 트리거(onScroll 페이징)와 스크롤 점프를 최대한 억제
async function reloadPreserveScroll() {
  const el = scrollRef.current;
  const prevTop = el?.scrollTop ?? 0;

  // reload 중 onScroll 페이징이 연쇄로 터지면서 화면이 크게 흔들리는 것을 방지
  suspendScrollLoadRef.current = true;

  try {
    await loadTailPage();
  } finally {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el2 = scrollRef.current;
        if (el2) {
          const maxTop = Math.max(0, el2.scrollHeight - el2.clientHeight);
          el2.scrollTop = Math.max(0, Math.min(prevTop, maxTop));
        }
        updateVisibleRangeNow();

        // 2프레임 뒤 해제(스크롤 복원 직후 연쇄 로드 방지)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            suspendScrollLoadRef.current = false;
          });
        });
      });
    });
  }
}

// ✅ (Fix #1-2) 삽입(=count 증가) 원격 반영 시 tail reload는 점멸/멈춤이 큼
// → 현재 화면의 "보이는 anchor" 기준으로 앞/뒤만 재구성해서 끼워넣기(스크롤 점프 최소)
async function rebuildWindowAroundVisibleAnchor(): Promise<boolean> {
  // 필터/정렬 모드에서는 window 재구성 시 화면 흔들림이 커서 보류
  if (filterMode || !!sortState?.key) return false;

  const cur = rowsRef.current;
  if (!cur.length) return false;

  const el = scrollRef.current;
  const vr = el ? calcVisibleRange(el, cur.length) : visibleRangeRef.current;

  const anchorIndex = Math.max(0, Math.min(cur.length - 1, vr.start));
  const anchor = cur[anchorIndex];
  if (!anchor) return false;

  const sortKey = Number(anchor.sort_key ?? NaN);
  const id = Number(anchor.id ?? NaN);
  if (!Number.isFinite(sortKey) || !Number.isFinite(id)) return false;

  const half = Math.max(50, Math.floor(PAGE_SIZE / 2));

  // 페이징 연쇄 로드 방지
  suspendScrollLoadRef.current = true;

  const prevTop = el?.scrollTop ?? 0;

  try {
    const [prevR, nextR, anchorR] = await Promise.all([
      fetch(`/api/unified?beforeSortKey=${sortKey}&beforeId=${id}&limit=${half}`, { cache: "no-store" }),
      fetch(`/api/unified?afterSortKey=${sortKey}&afterId=${id}&limit=${half}`, { cache: "no-store" }),
      fetch(`/api/unified?ids=${id}`, { cache: "no-store" }),
    ]);

    const prevJ = await prevR.json().catch(() => null);
    const nextJ = await nextR.json().catch(() => null);
    const anchorJ = await anchorR.json().catch(() => null);

    const prevRows: UnifiedRow[] = Array.isArray(prevJ?.rows) ? prevJ.rows : [];
    const nextRows: UnifiedRow[] = Array.isArray(nextJ?.rows) ? nextJ.rows : [];

    const anchorArr: UnifiedRow[] = Array.isArray(anchorJ) ? anchorJ : [];
    const anchorFresh = anchorArr[0] ?? anchor;

    const combined = [...prevRows, anchorFresh, ...nextRows];

    const anchorGlobalIndex = baseIndexRef.current + anchorIndex;
    const prevLen = prevRows.length;

    const baseFromApi = Number(prevJ?.baseIndex ?? NaN);
    const nextBase =
      Number.isFinite(baseFromApi) ? baseFromApi : Math.max(1, anchorGlobalIndex - prevLen);

    const nextTotal =
      Number(prevJ?.total ?? nextJ?.total ?? totalCountRef.current ?? combined.length);

    setRows(combined);
    setBaseIndex(nextBase);
    setTotalCount(nextTotal);

    // ref 즉시 동기화
    rowsRef.current = combined;
    baseIndexRef.current = nextBase;
    totalCountRef.current = nextTotal;

    // anchor가 화면에서 같은 위치에 있도록 scrollTop 보정
    // 기존 anchorIndex -> 새 anchorIndex(prevLen)
    const deltaIndex = prevLen - anchorIndex;
    const deltaPx = deltaIndex * ROW_HEIGHT;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el2 = scrollRef.current;
        if (el2) {
          const maxTop = Math.max(0, el2.scrollHeight - el2.clientHeight);
          const nextTop = Math.max(0, Math.min(prevTop + deltaPx, maxTop));
          el2.scrollTop = nextTop;
        }
        updateVisibleRangeNow();
      });
    });

    return true;
  } catch {
    return false;
  } finally {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suspendScrollLoadRef.current = false;
      });
    });
  }
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
      // ✅ count 증가 직후에는 setTotalCount(cnt)가 아직 반영되기 전이라(totalCount state 스테일)
      //    기존 로직이 "이미 끝"으로 오판해서 loadNextPage가 막히는 케이스가 생김
      //    → ref를 truth로 사용
      const lastGlobalIndex = baseIndexRef.current + rowsRef.current.length - 1;
      const total = totalCountRef.current;

      if (total > 0 && lastGlobalIndex >= total) return;

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

  const res = await fetch("/api/unified/insert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count, beforeId: null, afterId: null }),
  });

  // ✅ API 성공 전 emit/로컬반영 금지 + 실패면 reload로 복구
  if (!res.ok) {
    await reload();
    return;
  }

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

  // 로컬 반영(즉시 체감). 실패 시 reload로 복구.
  setRows((prev) => {
    const styleById = new Map<number, any>();
    for (const u of updates) styleById.set(u.id, (u.patch as any).__cellStyle);

    return prev.map((r) => {
      const nextStyle = styleById.get(r.id);
      if (!nextStyle) return r;
      return { ...r, data: { ...r.data, __cellStyle: nextStyle } };
    });
  });

  const res = await fetch(`/api/unified/bulk-patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  }); 

  // ✅ API 성공 전 emit 금지 + 실패면 reload로 복구
  if (!res.ok) {
    await reload();
    return;
  }

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

  // ✅ freeze는 “필터/정렬 중 편집”에서만 필요
  // 평상시에는 포커스만 남아도 원격 반영이 안 보이는 부작용이 커서 freeze 하지 않는다.
  if (!filterMode && !sortState?.key) return;

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

// ✅ 저장 후 서버값 검증(간헐적 저장 누락/삭제 부활/마지막 1개 미반영 체감 방지)
// - syncPatch는 내부에서 res.ok 체크를 안 하므로, UI/DB 불일치가 나면 “복구”가 필요함
// - 모든 셀에 매번 검증하면 네트워크가 무거울 수 있어, 문제 빈도가 높은 케이스만 검증한다.
function normalizeCellTextFromServer(v: any) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function isSameCellValue(expectedText: string, serverValue: any) {
  const expected = String(expectedText ?? "");
  const sv = serverValue;

  // expected="" (삭제) 인 경우: 서버는 null로 저장되므로 null/"" 모두 동일로 본다
  if (expected === "") {
    return sv === null || sv === undefined || String(sv) === "";
  }

  return normalizeCellTextFromServer(sv) === expected;
}

async function fetchRowNoStore(id: number): Promise<UnifiedRow | null> {
  try {
    const r = await fetch(`/api/unified/${id}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j || typeof j !== "object") return null;
    return j as UnifiedRow;
  } catch {
    return null;
  }
}

// ✅ 필요한 경우에만 “서버 저장값”을 확인하고, 다르면 로컬을 서버값으로 되돌린다.
async function verifyCellSavedOrRevert(args: { id: number; key: string; expected: string }) {
  const { id, key, expected } = args;

  const row = await fetchRowNoStore(id);

  // ✅ (Fix) 서버 재조회가 실패(null)면 "저장 성공"으로 오판하면 안 됨
  // 특히 expected==""(삭제)일 때 undefined를 성공으로 취급하면 저장 누락이 그대로 묻힘
  if (!row) {
    pendingReloadRef.current = true;
    return false;
  }

  const serverValue = (row as any)?.data?.[key];

  if (!isSameCellValue(expected, serverValue)) {
    const nextText = normalizeCellTextFromServer(serverValue);
    updateLocalCell(id, key, nextText);
    pendingReloadRef.current = true;
    return false;
  }
  return true;
}

// ✅ bulk-patch는 “로컬 즉시 반영” 후에도, 서버가 연쇄 업데이트(기기번호/거래처 등)를 할 수 있음.
//    그리고 write 중 원격 apply가 끼면 값이 되돌아가는 체감이 생길 수 있음.
//    → 서버 응답(rows)을 다시 merge해서 DB truth로 맞춘다.
async function bulkPatchAndReconcile(
  updates: { id: number; patch: Record<string, any> }[],
  options?: { guideMigrationMode?: boolean }
) {
  if (!updates.length) return;

  beginWrite();

  try {
    // bulk 작업은 중간에 원격 apply가 끼지 않게 suppress도 같이
    suppressReloadFor(2500);

    const guideMigrationMode = options?.guideMigrationMode === true;

    const endpoint = guideMigrationMode
      ? "/api/unified/migration-bulk-patch"
      : "/api/unified/bulk-patch";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });

    if (!res.ok) {
      let msg = "";

      try {
        msg = await res.text();
      } catch {
        // ignore
      }

      console.error("bulk-patch failed:", res.status, msg);

      // ✅ 실패했으면 “몇 초 뒤 사라짐”이 아니라 즉시 서버 truth로 복구(스크롤 튐 최소)
      try {
        await refreshVisibleRowsFromServer();
      } catch {
        // ignore
      }

      alert(
        `붙여넣기 저장 실패 (${res.status}).\n` +
          `개발자도구 Network에서 ${endpoint} 응답 확인 필요`
      );

      return;
    }

    const j = await res.json().catch(() => null);
    const serverRows = Array.isArray(j?.rows) ? (j.rows as UnifiedRow[]) : null;

    // ✅ 서버 truth를 rows에 재주입(연쇄 업데이트/정규화 반영 + 사라짐 방지)
    if (serverRows && serverRows.length) {
      const map = new Map<number, UnifiedRow>();

      for (const r of serverRows) {
        map.set(Number(r.id), r);
      }

      setRows((prev) =>
        prev.map((row) => {
          const s = map.get(row.id);
          if (!s) return row;

          return {
            ...row,
            sort_key: s.sort_key ?? row.sort_key,
            data: (s.data ?? row.data) as any,
          };
        })
      );
    }

    lastLocalUnifiedEmitAtRef.current = Date.now();
    syncEmitUnifiedUpdate();
  } finally {
    endWrite();
  }
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
        clearBlockedRowLock(rowId);
        myRowLocksRef.current[rowId] = true; // ✅ 즉시 기록
        setMyRowLocks((prev) => ({ ...prev, [rowId]: true }));
        return;
      }

      // 락 실패: 편집 상태/드래프트 정리
      editingCellRef.current = null;
      setActiveEditCell(null);
      setActiveEditValue("");

      if (result.reason === "locked_by_other" && (result as any).lock) {
        const lock = (result as any).lock as LockInfo;
        setBlockedRowLock(rowId, lock);
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
      function endAllDragging() {
        setIsRowDragging(false);
        setRowDragAnchor(null);

        setIsCellDragging(false);
        setCellDragAnchor(null);

        // ✅ 드래그 민감도 완화용 ref도 같이 초기화(남아있으면 다음 hover에서 오작동 가능)
        cellDragStartPosRef.current = null;
        cellDragMovedRef.current = false;
      }

      function onVisibilityChange() {
        // 탭 전환/최소화 등으로 mouseup이 누락되는 케이스가 있어 강제 종료
        if (document.hidden) endAllDragging();
      }

      // ✅ 거래처분류/안내분류 클릭 오픈 로직이 mouseup 전파를 막아도
      // Grid의 드래그 상태는 반드시 먼저 종료되게 capture 단계에서 처리한다.
      window.addEventListener("mouseup", endAllDragging, true);
      window.addEventListener("blur", endAllDragging);
      document.addEventListener("visibilitychange", onVisibilityChange);

      return () => {
        window.removeEventListener("mouseup", endAllDragging, true);
        window.removeEventListener("blur", endAllDragging);
        document.removeEventListener("visibilitychange", onVisibilityChange);
      };
    }, []); 

      // ✅ 셀 드래그 민감도 완화: threshold 넘기 전에는 moved=false 유지
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

    function isRowSelected(rowIndex: number) {
      if (!selectedRowRange) return false;
      return (
        rowIndex >= selectedRowRange.start && rowIndex <= selectedRowRange.end
      );
    }

    /* --------------------- 셀 범위 선택 유틸 --------------------- */

    function setCellRangeByPoints(r1: number, c1: number, r2: number, c2: number) {
      const currentDisplayRows =
        displayRowsRef.current && displayRowsRef.current.length
          ? displayRowsRef.current
          : rowsRef.current;

      const rowCount = currentDisplayRows.length;
      const colCount = viewColumns.length;

      if (rowCount <= 0 || colCount <= 0) {
        setSelectedCellRange(null);
        return;
      }

      const startRow = Math.max(0, Math.min(r1, r2));
      const endRow = Math.min(rowCount - 1, Math.max(r1, r2));
      const startCol = Math.max(0, Math.min(c1, c2));
      const endCol = Math.min(colCount - 1, Math.max(c1, c2));

      // 셀 범위만 관리 (행 선택과 분리)
      setSelectedCellRange({ startRow, endRow, startCol, endCol });
    }

        function handleCellMouseDown(
      rowIndex: number,
      colIndex: number,
      e: React.MouseEvent<HTMLTableCellElement>
    ) {
      if (e.button !== 0) return; // 좌클릭만

      // ✅ 드래그 시작점 기록 + moved 플래그 초기화
      cellDragStartPosRef.current = { x: e.clientX, y: e.clientY };
      cellDragMovedRef.current = false;

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

      // ✅ 클릭/미세 움직임에는 범위 확장 금지 (threshold 넘은 뒤에만)
      if (!isCellDragging || !cellDragAnchor) return;
      if (!cellDragMovedRef.current) return;

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

      const BULK_LOCK_CONCURRENCY = 8;

    async function runWithConcurrency<T, R>(
      items: T[],
      concurrency: number,
      worker: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
      const results = new Array<R>(items.length);
      let nextIndex = 0;

      const workerCount = Math.min(Math.max(1, concurrency), items.length);

      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (nextIndex < items.length) {
            const currentIndex = nextIndex++;
            results[currentIndex] = await worker(items[currentIndex], currentIndex);
          }
        })
      );

      return results;
    }

    async function acquireBulkLocksOrAlert(rowsToLock: UnifiedRow[], actionLabel: string) {
      const uniqueRows: UnifiedRow[] = [];
      const seen = new Set<number>();

      for (const row of rowsToLock) {
        const id = Number(row?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        uniqueRows.push(row);
      }

      if (!uniqueRows.length) return [] as number[];

      const results = await runWithConcurrency(
        uniqueRows,
        BULK_LOCK_CONCURRENCY,
        async (row) => {
          const rowId = Number(row.id);
          const result = await acquireLock("unified", rowId).catch(() => null);
          return { rowId, result };
        }
      );

      const acquiredIds: number[] = [];
      const failed = results.find(({ rowId, result }) => {
        if (result?.ok) {
          acquiredIds.push(rowId);
          return false;
        }
        return true;
      });

      if (!failed) {
        return acquiredIds;
      }

      await releaseBulkLocks(acquiredIds);

      const result = failed.result;

      if (result && !result.ok && result.reason === "locked_by_other" && result.lock) {
        const lock = result.lock as LockInfo;
        alert(
          `${actionLabel}을(를) 할 수 없습니다.\n` +
            `${lock.locked_by_name}님이 포함된 행을 편집 중입니다.`
        );
      } else if (result && !result.ok && result.reason === "unauthorized") {
        alert("로그인이 만료되었거나 권한이 없습니다. 다시 로그인해 주세요.");
      } else {
        alert(`${actionLabel}을(를) 할 수 없습니다. 잠시 후 다시 시도해 주세요.`);
      }

      return null;
    }

    async function releaseBulkLocks(lockIds: number[]) {
      const uniqueIds = Array.from(
        new Set(
          (lockIds || [])
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0)
            .map((id) => Math.floor(id))
        )
      );

      if (!uniqueIds.length) return;

      await runWithConcurrency(uniqueIds, BULK_LOCK_CONCURRENCY, async (id) => {
        try {
          await releaseLock("unified", id);
        } catch {
          // ignore
        }
      });
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

     // ✅ Delete는 선택 범위가 있을 때만 처리한다.
    // ✅ 단일 셀 Delete는 blur를 강제로 태우지 않는다.
    //    이유: blur → 저장 → 리렌더/remount 흐름 때문에 Delete 후 바로 입력할 커서가 사라졌음.
   useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "Delete") return;
    if ((e as any).isComposing) return;

    const hasCellRange = !!selectedCellRange;
    const hasRowRange = !!selectedRowRange;

    const isSingleCell =
      !!selectedCellRange &&
      selectedCellRange.startRow === selectedCellRange.endRow &&
      selectedCellRange.startCol === selectedCellRange.endCol;

    const ae = document.activeElement as HTMLElement | null;
    const isInput = !!ae && ae.tagName === "INPUT";
    const activeInput = isInput ? (ae as HTMLInputElement) : null;

    const isAllSelected =
      !!activeInput &&
      typeof activeInput.selectionStart === "number" &&
      typeof activeInput.selectionEnd === "number" &&
      activeInput.selectionStart === 0 &&
      activeInput.selectionEnd === (activeInput.value ?? "").length;

    // ✅ 단일 셀 선택 상태면, activeElement가 아니어도 해당 셀 input을 직접 찾는다.
    let targetInput: HTMLInputElement | null = null;

    if (isSingleCell && selectedCellRange) {
      targetInput = document.querySelector<HTMLInputElement>(
        `input[data-row="${selectedCellRange.startRow}"][data-col="${selectedCellRange.startCol}"]`
      );
    }

    if (!targetInput && activeInput) {
      targetInput = activeInput;
    }

    // ✅ 단일 셀 Delete / input 전체선택 Delete:
    //    값을 비우되 blur하지 않고 같은 input에 커서를 유지한다.
    if (targetInput && !targetInput.readOnly && (isSingleCell || isAllSelected)) {
      const rowAttr = targetInput.getAttribute("data-row");
      const colAttr = targetInput.getAttribute("data-col");

      const rowIndex = Number(rowAttr);
      const colIndex = Number(colAttr);
      const colKey = viewColumns[colIndex];

      const tr = targetInput.closest("tr[data-unified-id]");
      const rowId = Number(tr?.getAttribute("data-unified-id"));

      const isBlockedKey =
        colKey === "상태" ||
        colKey === "총연장횟수" ||
        colKey === "안내분류" ||
        isExtensionKey(colKey);

      if (
        Number.isFinite(rowIndex) &&
        Number.isFinite(colIndex) &&
        Number.isFinite(rowId) &&
        colKey &&
        !isBlockedKey
      ) {
        e.preventDefault();
        e.stopPropagation();

        // ✅ 편집 상태 유지: onBlur가 나중에 정상 저장하도록 현재 셀을 편집중으로 표시
        editingCellRef.current = { rowId, key: colKey };
        setActiveEditCell({ rowId, key: colKey });
        setActiveEditValue("");

        setSelectedRowRange(null);
        setSelectedCellRange({
          startRow: rowIndex,
          endRow: rowIndex,
          startCol: colIndex,
          endCol: colIndex,
        });
        lastFocusForPasteRef.current = { rowIndex, colIndex };

        // ✅ 핵심: blur 금지. input 값만 비우고 같은 셀 커서 유지.
        targetInput.value = "";
        targetInput.focus();

        try {
          targetInput.setSelectionRange(0, 0);
        } catch {
          // ignore
        }

        // ✅ 렌더/선택 표시 갱신 후에도 커서 유지 보강
        requestAnimationFrame(() => {
          try {
            targetInput?.focus();
            targetInput?.setSelectionRange(0, 0);
          } catch {
            // ignore
          }
        });

        return;
      }
    }

    // ✅ 선택이 없으면 기본 Delete 동작을 건드리지 않음
    if (!hasCellRange && !hasRowRange) return;

    // ✅ 범위 선택(여러 셀/행)일 때만 기존 지우기/삭제 흐름 유지
    e.preventDefault();
    e.stopPropagation();

    editingCellRef.current = null;
    setActiveEditCell(null);
    setActiveEditValue("");

    const el = document.activeElement as HTMLElement | null;
    if (el && el.tagName === "INPUT") (el as HTMLInputElement).blur();

    // ✅ 행 선택(셀 선택 없음) = 행 삭제
    if (hasRowRange && !hasCellRange) {
      void handleDeleteSelectedRows();
      return;
    }

    // ✅ 셀 범위 선택 = 내용 지우기
    void handleClearSelectedRows();
  }

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [selectedCellRange, selectedRowRange, viewColumns]);   

// ✅ (Fix #4) Delete 등으로 INPUT 포커스가 사라진 상태에서도
// 선택된 셀 범위가 있으면 방향키로 셀 이동이 되게 한다(화면 스크롤 방지)
useEffect(() => {
  function onArrowKeyDown(e: KeyboardEvent) {
    const key = e.key;
    const isArrow =
      key === "ArrowDown" || key === "ArrowUp" || key === "ArrowLeft" || key === "ArrowRight";
    if (!isArrow) return;
    if ((e as any).isComposing) return;

    // INPUT이 포커스면 기존 input onKeyDown(handleCellKeyDown)에게 맡김
    const ae = document.activeElement as HTMLElement | null;
    const tag = (ae?.tagName || "").toUpperCase();
    const isEditable =
      tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!ae?.isContentEditable;
    if (isEditable) return;

    if (!selectedCellRange) return;

    e.preventDefault();
    e.stopPropagation();

    const rowCount = displayRowsRef.current?.length ?? 0;
    const colCount = viewColumns.length;

    if (rowCount <= 0 || colCount <= 0) return;

    let targetRow = selectedCellRange.startRow;
    let targetCol = selectedCellRange.startCol;

    const allowPaging = !filterMode && !sortState?.key;

    if (key === "ArrowDown") {
      if (targetRow >= rowCount - 1) {
        if (allowPaging) void loadNextPage();
        return;
      }
      targetRow += 1;
    } else if (key === "ArrowUp") {
      if (targetRow <= 0) {
        if (allowPaging) void loadPrevPage();
        return;
      }
      targetRow -= 1;
    } else if (key === "ArrowRight") {
      if (targetCol < colCount - 1) {
        targetCol += 1;
      } else {
        if (targetRow >= rowCount - 1) {
          if (allowPaging) void loadNextPage();
          return;
        }
        targetRow += 1;
        targetCol = 0;
      }
    } else if (key === "ArrowLeft") {
      if (targetCol > 0) {
        targetCol -= 1;
      } else {
        if (targetRow <= 0) {
          if (allowPaging) void loadPrevPage();
          return;
        }
        targetRow -= 1;
        targetCol = colCount - 1;
      }
    }

    setSelectedRowRange(null);
    setCellRangeByPoints(targetRow, targetCol, targetRow, targetCol);
    lastFocusForPasteRef.current = { rowIndex: targetRow, colIndex: targetCol };

    if (focusCell(targetRow, targetCol)) return;

    const el = scrollRef.current;
    if (el) {
      const rowTop = targetRow * ROW_HEIGHT;
      const rowBottom = rowTop + ROW_HEIGHT;

      const viewTop = el.scrollTop;
      const viewBottom = viewTop + el.clientHeight;

      if (rowTop < viewTop) {
        el.scrollTop = Math.max(0, rowTop - Math.floor(el.clientHeight * 0.2));
      } else if (rowBottom > viewBottom) {
        el.scrollTop = Math.max(0, rowBottom - Math.floor(el.clientHeight * 0.8));
      }
    }

    requestAnimationFrame(() => {
      updateVisibleRangeNow();
      requestAnimationFrame(() => {
        focusCell(targetRow, targetCol);
      });
    });
  }

  window.addEventListener("keydown", onArrowKeyDown, true);
  return () => window.removeEventListener("keydown", onArrowKeyDown, true);
}, [selectedCellRange, filterMode, sortState?.key, viewColumns.length]);

       // Ctrl/Cmd+C: 복사, Ctrl/Cmd+V: pasteCatcher로 포커스 유도(붙여넣기 안정화)
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

        if (key === "v") {
          // ✅ paste 이벤트가 확실히 발생하도록 textarea로 포커스 이동
          // (preventDefault 하지 않는다 → 이어지는 paste 이벤트가 textarea로 들어온다)
          try {
            pasteCatcherRef.current?.focus();
          } catch {
            // ignore
          }
          return;
        }
      }

      window.addEventListener("keydown", onKeyDown, true);
      return () => window.removeEventListener("keydown", onKeyDown, true);
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
    }, [selectedCellRange, selectedRowRange, rows, viewColumns, migrationModeEnabled]);
         
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

  // ✅ 실패면 로컬 반영/emit 금지 + reload로 복구
  if (!insRes.ok) {
    await reload();
    setRowContextMenu(null);
    return;
  }

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
  const key = e.key;

  // ✅ Arrow 계열은 "경계에서 return" 해버리면 preventDefault가 안 걸려서 화면이 스크롤됨
  //    → 먼저 Arrow인지 확인되면 무조건 preventDefault/stopPropagation부터 걸고 분기한다.
  const isArrow =
    key === "ArrowDown" || key === "ArrowUp" || key === "ArrowLeft" || key === "ArrowRight";
  if (!isArrow) return;

  e.preventDefault();
  e.stopPropagation();

  let targetRow = rowIndex;
  let targetCol = colIndex;

  if (key === "ArrowDown") {
    // 마지막 행이면 우선 스크롤 방지만 하고(=화면 전체 이동 방지) 다음 페이지 로드를 시도
    if (rowIndex >= displayRows.length - 1) {
      const allowPaging = !filterMode && !sortState?.key;
      if (allowPaging) void loadNextPage();
      return;
    }
    targetRow = rowIndex + 1;
  } else if (key === "ArrowUp") {
    if (rowIndex <= 0) {
      const allowPaging = !filterMode && !sortState?.key;
      if (allowPaging) void loadPrevPage();
      return;
    }
    targetRow = rowIndex - 1;
  } else if (key === "ArrowRight") {
    if (colIndex < viewColumns.length - 1) {
      targetCol = colIndex + 1;
    } else {
      if (rowIndex >= displayRows.length - 1) {
        const allowPaging = !filterMode && !sortState?.key;
        if (allowPaging) void loadNextPage();
        return;
      }
      targetRow = rowIndex + 1;
      targetCol = 0;
    }
  } else if (key === "ArrowLeft") {
    if (colIndex > 0) {
      targetCol = colIndex - 1;
    } else {
      if (rowIndex <= 0) {
        const allowPaging = !filterMode && !sortState?.key;
        if (allowPaging) void loadPrevPage();
        return;
      }
      targetRow = rowIndex - 1;
      targetCol = viewColumns.length - 1;
    }
  }

  // ✅ 키보드 이동 시 하늘색 선택 표시도 커서 따라가게 동기화
  setSelectedRowRange(null);
  setCellRangeByPoints(targetRow, targetCol, targetRow, targetCol);
  lastFocusForPasteRef.current = { rowIndex: targetRow, colIndex: targetCol };

  // 1) 이미 렌더되어 있으면 바로 포커스
  if (focusCell(targetRow, targetCol)) return;

  // 2) 아직 렌더되어 있지 않으면: 해당 row가 보이도록 스크롤 → 렌더 → 포커스
  const el = scrollRef.current;
  if (el) {
    const rowTop = targetRow * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;

    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight;

    if (rowTop < viewTop) {
      el.scrollTop = Math.max(0, rowTop - Math.floor(el.clientHeight * 0.2));
    } else if (rowBottom > viewBottom) {
      el.scrollTop = Math.max(0, rowBottom - Math.floor(el.clientHeight * 0.8));
    }
  }

  requestAnimationFrame(() => {
    updateVisibleRangeNow();
    requestAnimationFrame(() => {
      focusCell(targetRow, targetCol);
    });
  });
}

    /* --------------------- 행 삭제 --------------------- */
      async function handleDeleteSelectedRows() {
  const { slice } = getSelectedRowRangeInfo();
  if (!slice.length) {
    setRowContextMenu(null);
    return;
  }

  const lockIds = await acquireBulkLocksOrAlert(slice, "행 삭제");
  if (!lockIds) {
    setRowContextMenu(null);
    return;
  }

  const ids = slice.map((r) => r.id);

  try {
    // 1) 서버 삭제 먼저 + 성공 여부 확인(실패하면 로컬삭제 금지)
    try {
      const res = await fetch(`/api/unified/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!res.ok) {
        // 실패면 화면/정합성 복구를 위해 강제 reload
        await reload();
        setRowContextMenu(null);
        setSelectedRowRange(null);
        return;
      }
    } catch (e) {
      // 네트워크/일시 오류도 동일 처리
      await reload();
      setRowContextMenu(null);
      setSelectedRowRange(null);
      return;
    }

    // 2) 여기부터는 "서버 삭제 성공"이 확정된 경우만 로컬 반영
    suspendScrollLoadBriefly();

    const idSet = new Set(ids);

    setRows((prev) => {
      let removedFromTop = 0;
      while (removedFromTop < prev.length && idSet.has(prev[removedFromTop].id)) {
        removedFromTop++;
      }
      if (removedFromTop > 0) setBaseIndex((b) => b + removedFromTop);

      return prev.filter((r) => !idSet.has(r.id));
    });

    setTotalCount((t) => Math.max(0, t - ids.length));

    suppressReloadFor(2500);

    lastLocalUnifiedEmitAtRef.current = Date.now();
    syncEmitUnifiedUpdate();

    // ✅ 드물게 이벤트 누락되는 케이스 완화(삭제에만 1회 추가 emit)
    setTimeout(() => {
      try {
        syncEmitUnifiedUpdate();
      } catch {
        // ignore
      }
    }, 250);

    setRowContextMenu(null);
    setSelectedRowRange(null);
  } finally {
    await releaseBulkLocks(lockIds);
  }
}   
       
     /* --------------------- 내용 지우기 (셀/행 단위 PATCH) --------------------- */

    async function handleClearSelectedRows() {
      // 1) 셀 범위가 있으면 셀만 지우기
      if (selectedCellRange) {
        const { startRow, endRow, startCol, endCol } = selectedCellRange;

        const updates: { id: number; patch: Record<string, any> }[] = [];

        // displayRows 기준 선택
        const selected = displayRows.slice(startRow, endRow + 1);

        for (const row of selected) {
          const patch: Record<string, any> = {};

          for (let cIndex = startCol; cIndex <= endCol; cIndex++) {
            const colKey = viewColumns[cIndex];
            if (!colKey) continue;
            if (
              colKey === "상태" ||
              colKey === "총연장횟수" ||
              colKey === "안내분류" ||
              isExtensionKey(colKey)
            ) {
              continue;
            }

            // ✅ 삭제는 null로 저장(단건 syncPatch와 의미 통일)
            patch[colKey] = null;
          }

          if (Object.keys(patch).length) {
            updates.push({ id: row.id, patch });
          }
        }

        if (!updates.length) {
          setRowContextMenu(null);
          return;
        }

        // ✅ 내용 지우기 대상 행에 다른 사용자 락이 있으면 중단
        const lockRows = selected.filter((row) => updates.some((u) => u.id === row.id));
        const lockIds = await acquireBulkLocksOrAlert(lockRows, "내용 지우기");
        if (!lockIds) {
          setRowContextMenu(null);
          return;
        }

        try {
          // ✅ 로컬 즉시 반영
          const patchById = new Map<number, Record<string, any>>();
          for (const u of updates) patchById.set(u.id, u.patch);

          setRows((prev) =>
            prev.map((r) => {
              const p = patchById.get(r.id);
              if (!p) return r;
              return { ...r, data: { ...(r.data ?? {}), ...p } };
            })
          );

          suspendScrollLoadBriefly();

          await bulkPatchAndReconcile(updates);
          setRowContextMenu(null);
          return;
        } finally {
          await releaseBulkLocks(lockIds);
        }
      }

      // 2) 셀 범위가 없으면 기존처럼 행 전체 지우기
      const { slice } = getSelectedRowRangeInfo();
      if (!slice.length) {
        setRowContextMenu(null);
        return;
      }

      const updates: { id: number; patch: Record<string, any> }[] = [];

      for (const row of slice) {
        const patch: Record<string, any> = {};

        viewColumns.forEach((key) => {
          if (
            key === "상태" ||
            key === "총연장횟수" ||
            key === "안내분류" ||
            isExtensionKey(key)
          ) {
            return;
          }

          patch[key] = null; // ✅ 행 전체 삭제도 null로 통일
        });

        if (Object.keys(patch).length) {
          updates.push({ id: row.id, patch });
        }
      }

      if (!updates.length) {
        setRowContextMenu(null);
        return;
      }

      // ✅ 내용 지우기 대상 행에 다른 사용자 락이 있으면 중단
      const lockRows = slice.filter((row) => updates.some((u) => u.id === row.id));
      const lockIds = await acquireBulkLocksOrAlert(lockRows, "내용 지우기");
      if (!lockIds) {
        setRowContextMenu(null);
        return;
      }

      try {
        // ✅ 로컬 즉시 반영
        const patchById = new Map<number, Record<string, any>>();
        for (const u of updates) patchById.set(u.id, u.patch);

        setRows((prev) =>
          prev.map((r) => {
            const p = patchById.get(r.id);
            if (!p) return r;
            return { ...r, data: { ...(r.data ?? {}), ...p } };
          })
        );

        suspendScrollLoadBriefly();

        await bulkPatchAndReconcile(updates);
        setRowContextMenu(null);
      } finally {
        await releaseBulkLocks(lockIds);
      }
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
                : String(row.data?.[colKey] ?? "");
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
              : String(row.data?.[key] ?? "")
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
      const isMigrationPaste = migrationModeEnabledRef.current;

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

      const parsed = parseExcelClipboardTSV(text);

      // 전부 빈 값이면 무시
      const hasAnyValue = parsed.some((row) => row.some((cell) => String(cell ?? "") !== ""));
      if (!hasAnyValue) {
        setRowContextMenu(null);
        return;
      }

      // ✅ 핵심: "완전 빈 행"("")도 엑셀처럼 '빈 행'으로 유지되도록,
      // 전체 붙여넣기 블록의 최대 컬럼 수로 행 폭을 맞춰 패딩한다.
      const maxCols = parsed.reduce((m, row) => Math.max(m, row.length), 0);
      const matrix = parsed.map((row) => {
        if (row.length >= maxCols) return row;
        return [...row, ...Array.from({ length: maxCols - row.length }, () => "")];
      });

      // ✅ displayRows 기준으로만 붙여넣기
      const targetRows = displayRows.slice(baseRowIndex, baseRowIndex + matrix.length);
      if (!targetRows.length) {
        setRowContextMenu(null);
        return;
      }

      const updates: { id: number; patch: Record<string, any> }[] = [];

      for (let i = 0; i < targetRows.length; i++) {
        const row = targetRows[i];
        const srcRow = matrix[i] ?? [];

        const patch: Record<string, any> = {};

        for (let colOffset = 0; colOffset < srcRow.length; colOffset++) {
          const colIndex = baseColIndex + colOffset;
          if (colIndex >= viewColumns.length) break;

          const key = viewColumns[colIndex];

          // ✅ 초기이관모드 ON일 때만 안내분류 원시값 붙여넣기 허용
          // - 평소 OFF에서는 기존처럼 안내분류는 자동매핑 전용으로 유지
          if (
            key === "상태" ||
            key === "총연장횟수" ||
            (!isMigrationPaste && key === "안내분류") ||
            isExtensionKey(key)
          ) {
            continue;
          }

          const raw = String(srcRow[colOffset] ?? "");
          const v = PASTE_REPLACE_CELL_NEWLINES_WITH_SPACE ? raw.replace(/\n+/g, " ") : raw;

          // ✅ 빈칸은 null로 저장(=DB에서 삭제 의미). 그래야 "빈 행"이 실제로 비워져서 행 밀림/왜곡이 사라짐.
          patch[key] = v === "" ? null : v;
        }

        if (Object.keys(patch).length) {
          // ✅ 초기이관모드 ON에서 붙여넣은 행은 안내분류 고정 행으로 확정
          // - 엑셀 원시 안내분류를 그대로 저장
          // - 서버 자동매핑이 이 요청에서 안내분류를 덮어쓰지 못하게 함
          // - 이후 OFF 상태에서도 이 행은 자동매핑 제외
          const nextPatch = isMigrationPaste ? withGuideMigrationLock(patch) : patch;

          updates.push({ id: row.id, patch: nextPatch });
        }
      }

      if (!updates.length) {
        setRowContextMenu(null);
        return;
      }

      // ✅ 붙여넣기 대상 행에 다른 사용자 락이 있으면 중단
      const lockRows = targetRows.filter((row) => updates.some((u) => u.id === row.id));
      const lockIds = await acquireBulkLocksOrAlert(lockRows, "붙여넣기");
      if (!lockIds) {
        setRowContextMenu(null);
        return;
      }

      try {
        // ✅ 로컬 즉시 반영(선택된 id만 patch merge)
        const patchById = new Map<number, Record<string, any>>();
        for (const u of updates) patchById.set(u.id, u.patch);

        setRows((prev) =>
          prev.map((r) => {
            const p = patchById.get(r.id);
            if (!p) return r;
            return { ...r, data: { ...(r.data ?? {}), ...p } };
          })
        );

        await bulkPatchAndReconcile(updates, { guideMigrationMode: isMigrationPaste });
        setRowContextMenu(null);
      } finally {
        await releaseBulkLocks(lockIds);
      }
    }

    async function handlePasteToSelectedRowsFromClipboard() {
      let text = "";

      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = "";
      }

      // ✅ 브라우저/PC 권한 정책으로 직접 읽기가 실패해도
      // ✅ prompt/alert 같은 대체 팝업은 띄우지 않는다.
      // ✅ 실제 Ctrl+V는 paste 이벤트의 clipboardData로 처리한다.
      if (!text) {
        try {
          pasteCatcherRef.current?.focus();
        } catch {
          // ignore
        }

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
             className="table-fixed border-collapse text-[11.6px] font-[350] antialiased text-slate-800"
             style={{
               fontFamily: '"Malgun Gothic","Apple SD Gothic Neo","Segoe UI",sans-serif',
               width: `${Math.max(
                 2800,
                 40 + viewColumns.reduce((sum, c) => sum + getWidthPx(c), 0)
               )}px`,
               minWidth: "100%",
             }}
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
                                       {viewColumns.map((c, idx) => {
                      const searchColumnActive = !!searchActiveColKey && c === searchActiveColKey;

                      return (
                        <th
                          key={c}
                          className={`border px-2 py-1 align-top sticky top-0 z-30 ${
                            searchColumnActive ? "bg-amber-100" : "bg-gray-100"
                          }`}
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
                      );
                    })}
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
                      const searchRowMatched = searchMatchedRowIdSet.has(row.id);
                      const searchRowActive = searchActiveRowId != null && row.id === searchActiveRowId;

                      const headerCellBase =
                        "border px-1 py-[3px] text-[0.68rem] text-center select-none" +
                        (rowSelected
                          ? " bg-blue-200 text-gray-800"
                          : searchRowActive
                          ? " bg-amber-200 text-slate-800"
                          : searchRowMatched
                          ? " bg-amber-50 text-slate-700"
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

  const searchRowMatched = searchMatchedRowIdSet.has(row.id);
  const searchRowActive = searchActiveRowId != null && row.id === searchActiveRowId;
  const searchCellActive =
    searchRowActive && !!searchActiveColKey && key === searchActiveColKey;

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

  const searchOverlay =
    searchCellActive
      ? "linear-gradient(rgba(245, 158, 11, 0.32), rgba(245, 158, 11, 0.32))"
      : searchRowActive
      ? "linear-gradient(rgba(251, 191, 36, 0.20), rgba(251, 191, 36, 0.20))"
      : searchRowMatched
      ? "linear-gradient(rgba(250, 204, 21, 0.12), rgba(250, 204, 21, 0.12))"
      : undefined;

  const cellStyle: React.CSSProperties | undefined =
    bgColor || searchOverlay || searchCellActive
      ? {
          ...(bgColor ? { backgroundColor: bgColor } : {}),
          ...(searchOverlay ? { backgroundImage: searchOverlay } : {}),
          ...(searchCellActive ? { boxShadow: "inset 0 0 0 2px #f59e0b" } : {}),
        }
      : undefined;

  const blockedLock = blockedRowLocks[row.id] ?? null;
  const rowBlockedByOther = !!blockedLock && !isLockExpired(blockedLock);

  return (
    <td
      key={key}
      className={dataCellBase}
      style={cellStyle}
      data-row-index={rowIndex}
      data-col-index={colIndex}
      data-col-key={key}
      onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
      onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
      onMouseLeave={() => handleCellMouseLeave(rowIndex, colIndex)}
      onContextMenu={(e) => handleCellContextMenu(rowIndex, colIndex, e)}
    >
      <input
  key={`${row.id}:${key}:${String(row.data?.[key] ?? "")}`}
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
        readOnly={
          rowBlockedByOther ||
          key === "상태" ||
          key === "총연장횟수" ||
          key === "안내분류" ||
          isExtensionKey(key)
        }
       {...(() => {
  const isReadOnly =
    rowBlockedByOther ||
    key === "상태" ||
    key === "총연장횟수" ||
    key === "안내분류" ||
    isExtensionKey(key);

  if (isReadOnly) {
    const roValue =
      key === "상태"
        ? getDerivedStatusForRow(row.data ?? {}).status
        : key === "총연장횟수"
        ? String(countExtensionRounds(row.data ?? {}))
        : String(row.data?.[key] ?? "");
    return { value: roValue };
  }

  return { defaultValue: String(row.data?.[key] ?? "") };
})()}
        data-row={rowIndex}
        data-col={colIndex}
                         onFocus={(e) => {
  setSelectedRowRange(null);

  // ✅ 상태/총연장횟수/안내분류/연장은 표시 전용: 락/편집 흐름 진입 금지
  if (key === "상태" || key === "총연장횟수" || key === "안내분류" || isExtensionKey(key)) return;

  // ✅ 편집 시작 시: displayRows 스냅샷 고정(필터/정렬로 행이 튕기는 것 방지)
  freezeDisplayRowsIfNeeded();

  const initial = String(row.data[key] ?? "");

  
  handleFocus(row.id, key, initial, e);
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

          const v0 = (e.target.value as string) ?? "";

          // ✅ 날짜 컬럼은 저장 시점에만 YYYYMMDD -> YYYY-MM-DD 정규화
          const v = DATE_KEYS.has(key) ? normalizeDateInput(v0) : String(v0 ?? "");

          // ✅ uncontrolled input이라 re-render 없이도 화면 값이 바뀌도록 DOM 값을 직접 동기화
          if (DATE_KEYS.has(key) && v !== v0) {
            try {
              (e.target as HTMLInputElement).value = v;
            } catch {
              // ignore
            }
          }

          // ✅ 같은 행에서 셀을 빠르게 연속 이동할 때 onBlur들의 실제 저장 로직이
          // 서로 겹치지 않도록, 지금부터 finally까지를 행(row.id) 단위로 순서대로 실행한다.
          // (v/v0 값은 이미 위에서 캡처했으므로 대기 중에도 값 유실 없음)
          await runQueuedForRow(row.id, async () => {

          // ✅ 저장 성공 여부(try 밖에서 관리 → finally에서 참조 가능)
          let savedOk = false;

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
          // ✅ (Fix) 간헐적으로 락 플래그/대기 타이밍이 어긋나 저장이 스킵될 수 있어
          //    onBlur에서 1회 락 재시도 후에만 포기한다.
          if (!hasLock) {
            const retry = await acquireLock("unified", row.id).catch(() => null);

            if (retry?.ok) {
              hasLock = true;
              myRowLocksRef.current[row.id] = true; // ✅ 즉시 기록
              setMyRowLocks((prev) => ({ ...prev, [row.id]: true }));
            } else {
              editingCellRef.current = null;
              setActiveEditCell(null);
              setActiveEditValue("");

              delete myRowLocksRef.current[row.id]; // ✅ ref도 정리

              if (pendingReloadRef.current) pendingReloadRef.current = false;

              await refreshVisibleRowsFromServer();
              unfreezeDisplayRows();
              return;
            }
          }

          try {
            // ✅ 저장 직후 소켓 echo/부분재조회가 1~2초 내로 들어오며 점멸하는 케이스 방지
            suppressReloadFor(2500);

            // ✅ blur 1회에만 로컬 반영 (입력 누락/잘림 방지)
            updateLocalCell(row.id, key, v);

            // ✅ 삭제(v==="")는 syncPatch가 res.ok 체크가 없어 저장 누락이 묻히는 케이스가 있음
            // → 안정화된 bulkPatchAndReconcile 경로로 저장 확정
            if (v === "") {
              await bulkPatchAndReconcile([{ id: row.id, patch: { [key]: null } }]);
            } else {
              await saveCell(row.id, key, v);
            }

            // ✅ 시작일/0차연장 변경 시:
            // - 0차연장 또는 1~15차 연장일수가 있을 때만 종료일 자동 계산
            // - 시작일만 입력된 경우에는 종료일을 시작일과 동일하게 자동 생성하지 않음
            // - 종료일을 엑셀에서 직접 붙여넣은 경우에는 그 값을 그대로 유지
            if (key === "시작일" || key === "0차연장") {
              const fresh = await fetchRowNoStore(row.id);
              const serverData = (fresh?.data ?? null) as Record<string, any> | null;

              if (serverData) {
                const data = {
                  ...serverData,
                  [key]: v,
                };

                const startDateRaw = String(data?.["시작일"] ?? "");
                const totalDays = sumExtensionDaysFromRow(data);
                const nextEnd = computeEndDateFromStartAndTotalDays(startDateRaw, totalDays);

                if (nextEnd) {
                  updateLocalCell(row.id, "종료일", nextEnd);
                  await saveCell(row.id, "종료일", nextEnd);
                  pendingReloadRef.current = true;
                }
              }
            }

            // ✅ 서버가 연쇄 업데이트를 하는 키(거래처→안내분류, 기기번호→기종/제품...)는
            //    부분 재조회로 화면 정합성 유지(현재 탭 + 다른 탭 반영 체감 개선)
            if (key === "거래처분류" || key === "기기번호") {
              pendingReloadRef.current = true;
            }

            // ✅ 문제가 자주 나는 케이스만 서버값 확인:
            // - 삭제(빈값)
            // - 날짜(정규화/표시 변경)
            const shouldVerify = v === "" || DATE_KEYS.has(key);

            if (shouldVerify) {
              const ok = await verifyCellSavedOrRevert({ id: row.id, key, expected: v });
              savedOk = ok;
            } else {
              savedOk = true;
            }
        
           if (savedOk && v === "") {
              setTimeout(() => {
                try {
                  syncEmitUnifiedUpdate();
                } catch {
                  // ignore
                }
              }, 250);
            }

          } catch {
            // 네트워크/예외 시: 서버 기준으로 복구하도록 부분 재조회 예약
            pendingReloadRef.current = true;
            savedOk = false;
            } finally {
            const nextFocusedRowId = getActiveUnifiedRowId();
            const keepRowLock = nextFocusedRowId === row.id;

            // ✅ 같은 행 내에서 다른 셀로 이동하는 blur라면:
            // - 락 해제/락 플래그 삭제/언프리즈/부분재조회 를 하지 않는다(레이스 방지)
            if (!keepRowLock) {
              await releaseLock("unified", row.id);

              delete myRowLocksRef.current[row.id]; // ✅ ref 먼저 정리

              setMyRowLocks((prev) => {
                const copy = { ...prev };
                delete copy[row.id];
                return copy;
              });
            }

            // ✅ 편집 상태 정리는 "행을 떠날 때"만
            if (!keepRowLock) {
              editingCellRef.current = null;
              setActiveEditCell(null);
              setActiveEditValue("");
            }

            // ✅ 저장이 실패했거나, 연쇄필드/불일치 복구가 필요하면 부분 재조회
            if (!savedOk) pendingReloadRef.current = true;

            // ✅ 같은 행에서 셀 이동 중이면 재조회/언프리즈는 보류(포커스/입력 안정성)
            if (!keepRowLock && pendingReloadRef.current) {
              pendingReloadRef.current = false;
              await refreshVisibleRowsFromServer();
            }

            if (!keepRowLock) {
              unfreezeDisplayRows();
            }
          }
          }); // runQueuedForRow 종료
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