"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
import ContextMenu from "@/views/dataUpload/signup-grid/ContextMenu";
import { parseTSV, toTSV } from "@/views/dataUpload/signup-grid/tsv";
import { safeReadClipboardText, safeWriteClipboardText } from "@/views/dataUpload/signup-grid/clipboard";
import CellEditor from "@/views/dataUpload/signup-grid/editors/CellEditor";
import { apiSignupTransfer } from "@/views/dataUpload/signup-transfer/serviceSignupTransfer";

type RowValues = Record<string, string>;

const MIN_WIDTH_PX = 70;
const STEP_MIN = 1;
const STEP_MAX = 70;

function widthPxFromStep(step: number) {
  const s = Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(step)));
  return Math.max(MIN_WIDTH_PX, s * 10);
}

function hasAnyValue(row: RowValues) {
  for (const v of Object.values(row)) {
    if (String(v ?? "").trim() !== "") return true;
  }
  return false;
}

function IconPlus({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconMinus({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" />
    </svg>
  );
}
function IconColumns({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M8 6v14M16 6v14M4 20h16" />
    </svg>
  );
}
function IconSend({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}

type CellPos = { r: number; c: number };

function normalizeRange(a: CellPos, b: CellPos) {
  const r1 = Math.min(a.r, b.r);
  const r2 = Math.max(a.r, b.r);
  const c1 = Math.min(a.c, b.c);
  const c2 = Math.max(a.c, b.c);
  return { r1, r2, c1, c2 };
}

type RowRange = { r1: number; r2: number };

function normalizeRowRange(a: number, b: number): RowRange {
  const r1 = Math.min(a, b);
  const r2 = Math.max(a, b);
  return { r1, r2 };
}

const ROW_HEADER_W = 46;

export default function SignupGrid({
  allColumns,
  selectedKeys,
  loadingColumns,
  onError,

  initialColWidthSteps,
  initialRowCount,
  onColWidthStepsChange,
  onRowCountChange,

  partnerOptions,
  onAddPartnerOption,

  initialRows,
  onRowsChange,
  onSubmitSuccess,
  onTransferFailed,

  // ✅ 강제전송 트리거(부모 모달에서 +1)
  forceSubmitToken,

  // ✅ 외부 reload(다른 탭 수정 등) 반영 강제용 토큰
  rowsReloadToken,
}: {
  allColumns: string[];
  selectedKeys: string[];
  loadingColumns: boolean;
  onError: (msg: string) => void;

  initialColWidthSteps?: Record<string, number>;
  initialRowCount?: number;

  onColWidthStepsChange?: (next: Record<string, number>) => void;
  onRowCountChange?: (count: number) => void;

  partnerOptions?: string[];
  onAddPartnerOption?: (name: string) => void | Promise<void>;

  initialRows?: RowValues[];
  onRowsChange?: (rows: RowValues[]) => void;
  onSubmitSuccess?: () => void | Promise<void>;
  onTransferFailed?: (message: string) => void;

  forceSubmitToken?: number;
  rowsReloadToken?: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const gridActiveRef = useRef(false);

  const [rows, setRows] = useState<RowValues[]>([{}]);
  const [colWidthSteps, setColWidthSteps] = useState<Record<string, number>>({});
  const [resizeMode, setResizeMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 강제전송 토큰 변화 감지(모달에서 +1)
  const lastForceSubmitTokenRef = useRef<number | null>(null);

  // submitting 최신값을 effect에서 안전하게 보기 위한 ref
  const submittingRef = useRef(false);
  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  const [active, setActive] = useState<CellPos | null>(null);
  const [anchor, setAnchor] = useState<CellPos | null>(null);
  const [range, setRange] = useState<{ r1: number; r2: number; c1: number; c2: number } | null>(null);

  // ✅ pointer 이벤트에서 setState 직후에도 즉시 기준점이 필요(간헐 선택 깨짐 방지)
  const anchorRef = useRef<CellPos | null>(null);
  const activeRef = useRef<CellPos | null>(null);

    const draggingRef = useRef(false);

  // ✅ 셀 내부 input이 포커스/텍스트선택을 먼저 가져가면서 드래그가 깨지는 문제 방지:
  // "드래그였는지/단순 클릭이었는지"를 구분해서, 클릭일 때만 포커스 주기
  const dragStartCellRef = useRef<CellPos | null>(null);
  const didDragRef = useRef(false);

 // ✅ 셀 드래그가 셀 밖에서 끝나도 pointer capture를 확실히 정리(선택 불안정/우클릭 시 깨짐 방지)
  const cellCaptureElRef = useRef<HTMLElement | null>(null);
  const cellCapturePointerIdRef = useRef<number | null>(null);

  // ✅ 행 선택(왼쪽 번호 컬럼) 전용
  const [rowRange, setRowRange] = useState<RowRange | null>(null);
  const rowDraggingRef = useRef(false);
  const rowAnchorRef = useRef<number | null>(null);

  // ✅ 행 드래그도 셀과 동일하게 capture 잔존 방지(두번중 한번 안됨 방지)
  const rowCaptureElRef = useRef<HTMLElement | null>(null);
  const rowCapturePointerIdRef = useRef<number | null>(null);

  const [hoverRow, setHoverRow] = useState<number | null>(null);

  const [menu, setMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    mode: "cell" | "row";
    baseRow: number | null;
  }>(() => ({
    open: false,
    x: 0,
    y: 0,
    mode: "cell",
    baseRow: null,
  }));

  const lastCopiedRef = useRef<string>("");
  const suppressFocusSelectionRef = useRef(false);

  // ✅ 붙여넣기/키보드 입력 안정화를 위해 실제 포커스 대상은 textarea(하지만 강제 focus는 최소화)
  const gridFocusRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ Ctrl+V 시 브라우저별로 paste 이벤트가 안 잡히는 경우 대비: fallback 타이머
  const lastPasteHandledAtRef = useRef(0);
  const pasteFallbackTimerRef = useRef<number | null>(null);

  // rows hydrate/저장 덮어쓰기 방지용
  const rowsHydratedRef = useRef(false);
  const rowsTouchedRef = useRef(false);
  const rowsInitSourceRef = useRef<"none" | "draft" | "blank">("none");

  // ✅ 외부(다른 탭) reload로 들어온 rows를 그리드에 적용할 때, onRowsChange로 다시 저장 루프가 돌지 않게 차단
  const suppressOnRowsChangeRef = useRef(false);

  // 열넓이 모드 ON/OFF 감지(OFF 순간에 1회 저장 트리거)
  const prevResizeModeRef = useRef(false);

  // settings가 늦게 도착해도(사용자 조작 전까지) colWidthSteps를 다시 적용하기 위한 플래그
  const colWidthTouchedRef = useRef(false);

  // 외부 reload 토큰 추적
  const lastRowsReloadTokenRef = useRef<number | null>(null);

  const selectedColumns = useMemo(() => {
    const set = new Set(allColumns);
    return selectedKeys.filter((k) => set.has(k));
  }, [selectedKeys, allColumns]);

  const showToolbar = selectedColumns.length > 0;

  // ---- 최신 상태 ref(전역 이벤트 핸들러에서 stale 방지)
  const selectedColumnsRef = useRef<string[]>([]);
  const rowsRef = useRef<RowValues[]>([]);
  const rangeRef = useRef<typeof range>(null);
  const rowRangeRef = useRef<RowRange | null>(null);

  useEffect(() => {
    selectedColumnsRef.current = selectedColumns;
  }, [selectedColumns]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    rangeRef.current = range;
  }, [range]);

    useEffect(() => {
    rowRangeRef.current = rowRange;
  }, [rowRange]);

    // ✅ setState 직후에도 ref가 즉시 최신값을 보게(우클릭/단축키/삭제/행삭제의 간헐 실패 방지)
  function setRangeSync(next: typeof range) {
    rangeRef.current = next;
    setRange(next);
  }

  function setRowRangeSync(next: RowRange | null) {
    rowRangeRef.current = next;
    setRowRange(next);
  }

  // colWidthSteps hydrate: settings가 늦게 들어와도 사용자 조작 전이면 재적용
  useEffect(() => {
    if (colWidthTouchedRef.current) return;
    if (!initialColWidthSteps || typeof initialColWidthSteps !== "object") return;

    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(initialColWidthSteps)) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      next[String(k)] = Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(n)));
    }
    setColWidthSteps(next);
  }, [initialColWidthSteps]);

  // 열넓이 모드 OFF 순간에 상위로 한번 더 저장 호출(누락 방지)
  useEffect(() => {
    const prev = prevResizeModeRef.current;
    if (prev === true && resizeMode === false) {
      onColWidthStepsChange?.({ ...colWidthSteps });
    }
    prevResizeModeRef.current = resizeMode;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeMode]);

  // rows hydrate: draft가 "나중에" 도착하는 케이스까지 고려
  useEffect(() => {
    const hasDraftRows = Array.isArray(initialRows) && initialRows.length >= 1;

    // ✅ 외부 reload 토큰이 바뀐 경우: 사용자가 편집했더라도(=touched) 서버 최신 rows를 강제로 반영
    const token = typeof rowsReloadToken === "number" ? rowsReloadToken : null;
    const tokenChanged = token != null && token !== lastRowsReloadTokenRef.current;

    if (tokenChanged && hasDraftRows) {
      lastRowsReloadTokenRef.current = token;

      suppressOnRowsChangeRef.current = true;
      setRows(initialRows!.map((r) => (r && typeof r === "object" ? r : {})));

      // 외부 reload는 "사용자 수정"이 아님
      rowsTouchedRef.current = false;
      rowsHydratedRef.current = true;
      rowsInitSourceRef.current = "draft";

      // 선택은 최소 정리(오동작 방지)
      draggingRef.current = false;
      rowDraggingRef.current = false;
      rowAnchorRef.current = null;
      anchorRef.current = null;
      activeRef.current = null;
      setRangeSync(null);
      setAnchor(null);
      setActive(null);
      setRowRangeSync(null);

      return;
    }

    if (hasDraftRows && (!rowsHydratedRef.current || !rowsTouchedRef.current)) {
      suppressOnRowsChangeRef.current = true;
      setRows(initialRows!.map((r) => (r && typeof r === "object" ? r : {})));
      rowsHydratedRef.current = true;
      rowsInitSourceRef.current = "draft";
      return;
    }

    if (!rowsHydratedRef.current && !hasDraftRows) {
      const rawCount = Number(initialRowCount);
      if (Number.isFinite(rawCount) && rawCount >= 1) {
        const count = Math.min(500, Math.max(1, Math.floor(rawCount)));
        suppressOnRowsChangeRef.current = true;
        setRows(Array.from({ length: count }, () => ({})));
      } else {
        suppressOnRowsChangeRef.current = true;
        setRows([{}]);
      }

      rowsHydratedRef.current = true;
      rowsInitSourceRef.current = "blank";
    }
  }, [initialRows, initialRowCount, rowsReloadToken]);

  // rows 변경 시 상위로 알림(자동저장 훅에서 처리)
  useEffect(() => {
    if (!rowsHydratedRef.current) return;

    // ✅ 외부 hydrate/reload로 setRows된 경우: 저장 루프 방지
    if (suppressOnRowsChangeRef.current) {
      suppressOnRowsChangeRef.current = false;
      return;
    }

    if (rowsInitSourceRef.current === "blank" && !rowsTouchedRef.current) return;
    onRowsChange?.(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

    // ✅ 그리드 활성화 상태 관리(전역 키/붙여넣기 이벤트 처리용)
  useEffect(() => {
    function setActiveByEventTarget(t: EventTarget | null) {
      const root = rootRef.current;
      if (!root) return;

      const node = t as Node | null;
      const inside = !!node && root.contains(node);
      gridActiveRef.current = inside;
    }

    function onDownCapture(e: MouseEvent) {
      setActiveByEventTarget(e.target);
    }

    function onFocusInCapture(e: FocusEvent) {
      // input/select 등 포커스가 이동해도 gridActive 유지
      setActiveByEventTarget(e.target);
    }

    window.addEventListener("mousedown", onDownCapture, true);
    window.addEventListener("focusin", onFocusInCapture, true);

    return () => {
      window.removeEventListener("mousedown", onDownCapture, true);
      window.removeEventListener("focusin", onFocusInCapture, true);
    };
  }, []);

     useEffect(() => {
    const onPointerUp = () => {
      // ✅ 셀 드래그가 셀 밖에서 끝나도 capture를 확실히 release
      if (draggingRef.current) {
        const el = cellCaptureElRef.current;
        const pid = cellCapturePointerIdRef.current;
        if (el && pid != null) {
          try {
            el.releasePointerCapture(pid);
          } catch {
            // ignore
          }
        }
        cellCaptureElRef.current = null;
        cellCapturePointerIdRef.current = null;
      }
      draggingRef.current = false;

      // ✅ 행 드래그도 셀과 동일하게 capture 잔존 방지
      {
        const el = rowCaptureElRef.current;
        const pid = rowCapturePointerIdRef.current;
        if (el && pid != null) {
          try {
            el.releasePointerCapture(pid);
          } catch {
            // ignore
          }
        }
        rowCaptureElRef.current = null;
        rowCapturePointerIdRef.current = null;
      }

      // ✅ 행 드래그도 강제 종료(포인터가 header 밖에서 up 되는 케이스)
      rowDraggingRef.current = false;
      rowAnchorRef.current = null;
    };

    // ✅ 드래그 중 브라우저가 pointercancel(스크롤/포커스/텍스트선택 개입 등)을 발생시키는 케이스에서도
    // 드래그가 “깨진 상태”로 남지 않게 동일 종료 처리
    const onPointerCancel = () => {
      onPointerUp();
    };

    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);

    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, []);

    useEffect(() => {
    const onWindowDown = (e: MouseEvent) => {
      if (!menu.open) return;

      const t = e.target as HTMLElement | null;

      // ✅ 메뉴 내부 클릭이면 닫지 않음(메뉴 아이템 클릭이 "되다가 안되다가" 하던 원인 제거)
      if (t?.closest?.('[data-sg-context-menu="1"]')) return;

      setMenu((m) => ({ ...m, open: false, baseRow: null }));
    };

    window.addEventListener("mousedown", onWindowDown);
    return () => window.removeEventListener("mousedown", onWindowDown);
  }, [menu.open]);

  function focusGridForPaste() {
    // ctrl+v 타겟을 textarea로 만들어 paste 이벤트를 안정화
    try {
      gridFocusRef.current?.focus();
    } catch {
      // ignore
    }
  }

  function getStep(key: string) {
    const s = Number(colWidthSteps[key]);
    if (Number.isFinite(s)) return Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(s)));
    return 16;
  }

  function setStep(key: string, next: number) {
    // 사용자가 열넓이를 건드린 순간부터는 서버에서 늦게 온 값으로 덮어쓰지 않음
    colWidthTouchedRef.current = true;

    const s = Math.max(STEP_MIN, Math.min(STEP_MAX, Math.floor(next)));
    setColWidthSteps((prev) => {
      const merged = { ...prev, [key]: s };
      onColWidthStepsChange?.(merged);
      return merged;
    });
  }

  function updateRows(updater: (prev: RowValues[]) => RowValues[]) {
    rowsTouchedRef.current = true;
    setRows((prev) => {
      const next = updater(prev);
      if (next.length !== prev.length) {
        onRowCountChange?.(next.length);
      }
      return next;
    });
  }

  function add10Rows() {
    updateRows((prev) => [...prev, ...Array.from({ length: 10 }, () => ({}))]);
  }

    function delete1RowFromBottom() {
    // ✅ 행 선택(좌측 번호 드래그) 상태면: 선택된 행 삭제가 우선
    if (rowRangeRef.current) {
      deleteSelectedRows();
      return;
    }

    // 선택이 없으면 기존 동작 유지(맨 아래 1행 삭제)
    updateRows((prev) => {
      if (prev.length <= 1) return [{}];
      return prev.slice(0, prev.length - 1);
    });
  }

  function insertRowsAt(index: number, count: number) {
    const at = Math.max(0, Math.floor(index));
    const n = Math.max(1, Math.min(5000, Math.floor(count)));

    updateRows((prev) => {
      const safeAt = Math.max(0, Math.min(prev.length, at));
      const next = prev.slice();
      next.splice(safeAt, 0, ...Array.from({ length: n }, () => ({})));
      return next;
    });

    // 삽입 후 선택 유지(삽입된 행 선택)
    draggingRef.current = false;
    anchorRef.current = null;
    activeRef.current = null;
    setRangeSync(null);
    setAnchor(null);
    setActive(null);

    rowDraggingRef.current = false;
    rowAnchorRef.current = at;
    setRowRangeSync(normalizeRowRange(at, at + n - 1));
  }

  function deleteSelectedRows() {
    if (!rowRangeRef.current) return;

    const rr = rowRangeRef.current;

    updateRows((prev) => {
      const next = prev.slice();
      next.splice(rr.r1, rr.r2 - rr.r1 + 1);
      if (next.length === 0) return [{}];
      return next;
    });

    draggingRef.current = false;
    anchorRef.current = null;
    activeRef.current = null;
    setRangeSync(null);
    setAnchor(null);
    setActive(null);

    rowDraggingRef.current = false;
    rowAnchorRef.current = null;
    setRowRangeSync(null);
  }

  function setCell(rowIndex: number, key: string, value: string) {
    rowsTouchedRef.current = true;
    setRows((prev) => {
      const next = prev.slice();
      const row = { ...(next[rowIndex] || {}) };
      row[key] = value;
      next[rowIndex] = row;
      return next;
    });
  }

  function ensureRowsCount(minCount: number) {
    updateRows((prev) => {
      if (prev.length >= minCount) return prev;
      const next = prev.slice();
      while (next.length < minCount) next.push({});
      return next;
    });
  }

    function clearRowSelection() {
    rowDraggingRef.current = false;
    rowAnchorRef.current = null;
    setRowRangeSync(null);
  }

   function clearCellSelection() {
    draggingRef.current = false;
    anchorRef.current = null;
    activeRef.current = null;
    setRangeSync(null);
    setAnchor(null);
    setActive(null);
  }

    function selectSingle(r: number, c: number) {
    const p = { r, c };
    activeRef.current = p;
    anchorRef.current = p;

    setActive(p);
    setAnchor(p);
    setRangeSync(normalizeRange(p, p));
  }

    function selectFromAnchor(to: CellPos) {
    const a = anchorRef.current;

    if (!a) {
      anchorRef.current = to;
      activeRef.current = to;
      setAnchor(to);
      setActive(to);
      setRangeSync(normalizeRange(to, to));
      return;
    }

    activeRef.current = to;
    setActive(to);
    setRangeSync(normalizeRange(a, to));
  }

  function isRowSelected(r: number) {
    const rr = rowRange;
    if (!rr) return false;
    return r >= rr.r1 && r <= rr.r2;
  }

    function selectRowSingle(r: number) {
    rowAnchorRef.current = r;
    setRowRangeSync(normalizeRowRange(r, r));

    // row 선택 시에는 cell 선택은 해제(엑셀 느낌)
    clearCellSelection();
  }

   function selectRowsFromAnchor(toRow: number) {
    const a = rowAnchorRef.current;
    if (a == null) {
      rowAnchorRef.current = toRow;
      setRowRangeSync(normalizeRowRange(toRow, toRow));
      return;
    }
    setRowRangeSync(normalizeRowRange(a, toRow));
  }

  function isSelectedCell(r: number, c: number) {
    const rr = range;
    if (!rr) return false;
    return r >= rr.r1 && r <= rr.r2 && c >= rr.c1 && c <= rr.c2;
  }

  function getSelectionTopLeft(): CellPos | null {
    const rr = rowRangeRef.current;
    if (rr) return { r: rr.r1, c: 0 };

    const cr = rangeRef.current;
    if (cr) return { r: cr.r1, c: cr.c1 };

    if (activeRef.current) return activeRef.current;
    return null;
  }

  function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  function getMoveBaseCell(): CellPos {
    if (activeRef.current) return activeRef.current;
    const tl = getSelectionTopLeft();
    if (tl) return tl;
    return { r: 0, c: 0 };
  }

  function focusCellEditor(r: number, c: number) {
    if (typeof document === "undefined") return;

    const cell = document.querySelector(`[data-sg-cell="1"][data-r="${r}"][data-c="${c}"]`) as HTMLElement | null;
    if (!cell) return;

    try {
      cell.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {
      // ignore
    }

    const editor = cell.querySelector("input,select,textarea,[contenteditable='true']") as HTMLElement | null;

    requestAnimationFrame(() => {
      try {
        editor?.focus?.();
      } catch {
        // ignore
      }
    });
  }

  function moveSelectionBy(dr: number, dc: number, expand: boolean) {
    if (!showToolbar) return;
    if (selectedColumnsRef.current.length === 0) return;
    if (rowsRef.current.length === 0) return;

    // 행 선택 중이면 셀 선택으로 전환 후 이동
    const rr = rowRangeRef.current;
    if (rr) {
      clearRowSelection();
      selectSingle(rr.r1, 0);
    }

    const base = getMoveBaseCell();

    const nextR = clamp(base.r + dr, 0, rowsRef.current.length - 1);
    const nextC = clamp(base.c + dc, 0, selectedColumnsRef.current.length - 1);

    if (expand) {
      selectFromAnchor({ r: nextR, c: nextC });
    } else {
      selectSingle(nextR, nextC);
    }

    focusCellEditor(nextR, nextC);
  }

  async function copySelection() {
    const cols = selectedColumnsRef.current;
    if (cols.length === 0) return;

    const rr = rowRangeRef.current;
    if (rr) {
      const matrix: string[][] = [];
      for (let r = rr.r1; r <= rr.r2; r++) {
        const row = rowsRef.current[r] || {};
        const line = cols.map((k) => String(row?.[k] ?? ""));
        matrix.push(line);
      }
      const text = toTSV(matrix);
      lastCopiedRef.current = text;
      await safeWriteClipboardText(text);
      return;
    }

    const cr = rangeRef.current;
    if (!cr) return;

    const matrix: string[][] = [];
    for (let r = cr.r1; r <= cr.r2; r++) {
      const row = rowsRef.current[r] || {};
      const line: string[] = [];
      for (let c = cr.c1; c <= cr.c2; c++) {
        const key = cols[c];
        line.push(String(row?.[key] ?? ""));
      }
      matrix.push(line);
    }

    const text = toTSV(matrix);
    lastCopiedRef.current = text;
    await safeWriteClipboardText(text);
  }

  function clearSelectionValues() {
    const cols = selectedColumnsRef.current;
    if (cols.length === 0) return;

    const rr = rowRangeRef.current;
    if (rr) {
      rowsTouchedRef.current = true;
      setRows((prev) => {
        const next = prev.slice();
        for (let r = rr.r1; r <= rr.r2; r++) {
          const base = { ...(next[r] || {}) };
          for (const key of cols) base[key] = "";
          next[r] = base;
        }
        return next;
      });
      return;
    }

    const cr = rangeRef.current;
    if (!cr) return;

    rowsTouchedRef.current = true;
    setRows((prev) => {
      const next = prev.slice();
      for (let r = cr.r1; r <= cr.r2; r++) {
        const base = { ...(next[r] || {}) };
        for (let c = cr.c1; c <= cr.c2; c++) {
          const key = cols[c];
          base[key] = "";
        }
        next[r] = base;
      }
      return next;
    });
  }

    function pasteMatrixAt(start: CellPos, matrix: string[][]) {
    const cols = selectedColumnsRef.current;
    if (cols.length === 0) return;
    if (matrix.length === 0) return;

    rowsTouchedRef.current = true;

    const needRows = start.r + matrix.length;

    // ✅ 붙여넣기는 "단 1번의 setRows"로 끝낸다(점멸/사라짐/저장폭주 방지)
    setRows((prev) => {
      let next = prev.slice();

      // 필요한 만큼 행을 늘림
      if (next.length < needRows) {
        const add = needRows - next.length;
        next = [...next, ...Array.from({ length: add }, () => ({}))];

        // 기존 updateRows가 하던 rowCount 저장 트리거를 동일하게 유지
        onRowCountChange?.(next.length);
      }

      for (let rr = 0; rr < matrix.length; rr++) {
        const rIndex = start.r + rr;
        const base = { ...(next[rIndex] || {}) };

        for (let cc = 0; cc < matrix[rr].length; cc++) {
          const cIndex = start.c + cc;
          if (cIndex >= cols.length) break;
          const key = cols[cIndex];
          base[key] = String(matrix[rr][cc] ?? "");
        }

        next[rIndex] = base;
      }

      return next;
    });

    // 붙여넣기 후 선택 범위 표시를 엑셀처럼 확장
    const endR = start.r + matrix.length - 1;
    const endC = start.c + (matrix[0]?.length ? matrix[0].length - 1 : 0);

    const expectedRowLen = Math.max(rowsRef.current.length, needRows);

    const safeEndR = clamp(endR, 0, Math.max(0, expectedRowLen - 1));
    const safeEndC = clamp(endC, 0, cols.length - 1);
    const a = { r: start.r, c: start.c };
    const b = { r: safeEndR, c: safeEndC };

    anchorRef.current = a;
    activeRef.current = b;

    setAnchor(a);
    setActive(b);
    setRangeSync(normalizeRange(a, b));
  }

    async function pasteFromClipboard() {
    const start = getSelectionTopLeft();
    if (!start) return;

    const text = (await safeReadClipboardText().catch(() => "")) || lastCopiedRef.current || "";

    // ✅ 권한/브라우저 정책으로 readText가 막히는 경우 prompt fallback
    const finalText =
      text || window.prompt("붙여넣을 내용을 여기에 Ctrl+V로 붙여넣고 확인을 누르세요.") || "";

    if (!finalText) return;

    const matrix = parseTSV(finalText);
    pasteMatrixAt(start, matrix);
  }

  function findCellFromPoint(x: number, y: number): CellPos | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;

    // ✅ 셀 드래그 중 행번호 영역을 지나가도 끊기지 않게: row header면 현재 열 유지
    const rowHeader = el.closest("[data-sg-row-header='1']") as HTMLElement | null;
    if (rowHeader) {
      const rr = Number(rowHeader.dataset.r);
      if (!Number.isFinite(rr)) return null;

      const baseCol = activeRef.current?.c ?? anchorRef.current?.c ?? 0;
      const safeCol = Math.max(0, Math.min(selectedColumnsRef.current.length - 1, Math.floor(baseCol)));
      return { r: Math.floor(rr), c: safeCol };
    }

    const cell = el.closest("[data-sg-cell='1']") as HTMLElement | null;
    if (!cell) return null;

    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
    return { r, c };
  }

  function findRowFromPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;

    const rowHeader = el.closest("[data-sg-row-header='1']") as HTMLElement | null;
    if (rowHeader) {
      const rr = Number(rowHeader.dataset.r);
      if (Number.isFinite(rr)) return rr;
    }

    const cell = el.closest("[data-sg-cell='1']") as HTMLElement | null;
    if (!cell) return null;

    const r = Number(cell.dataset.r);
    if (!Number.isFinite(r)) return null;
    return r;
  }

  function handleCellPointerDown(e: React.PointerEvent, r: number, c: number) {
    if (e.button !== 0) return;
    if (!showToolbar) return;

    gridActiveRef.current = true;

    // 셀 클릭 시 row 선택 해제
    clearRowSelection();

    draggingRef.current = true;

    const p = { r, c };
    anchorRef.current = p;
    activeRef.current = p;

    setAnchor(p);
    setActive(p);
    setRangeSync(normalizeRange(p, p));

        // ✅ 드래그 시작 기록
    dragStartCellRef.current = { r, c };
    didDragRef.current = false;

    // ✅ 셀 내부 input이 텍스트 선택/포커스를 먼저 가져가면 드래그가 끊기거나 selection이 축소될 수 있어
    // 드래그 시작 시점에는 기본 동작을 막는다.
    e.preventDefault();

    const el = e.currentTarget as HTMLElement;
    cellCaptureElRef.current = el;
    cellCapturePointerIdRef.current = e.pointerId;
    el.setPointerCapture(e.pointerId);
  }

    function handleCellPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const p = findCellFromPoint(e.clientX, e.clientY);
    if (!p) return;

    const prev = activeRef.current;
    if (!prev || prev.r !== p.r || prev.c !== p.c) {
      didDragRef.current = true;
    }

    selectFromAnchor(p);
  }

    function handleCellPointerUp(e: React.PointerEvent) {
    draggingRef.current = false;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    } finally {
      cellCaptureElRef.current = null;
      cellCapturePointerIdRef.current = null;
    }

    // ✅ 단순 클릭이면 포커스, 드래그였다면 포커스 주지 않음(우클릭/복사/붙여넣기용 selection 유지)
    if (!didDragRef.current) {
      const el = e.currentTarget as HTMLElement;
      const rr = Number(el.dataset.r);
      const cc = Number(el.dataset.c);
      if (Number.isFinite(rr) && Number.isFinite(cc)) {
        focusCellEditor(rr, cc);
      }
    }
  }

   function handleCellContextMenu(e: React.MouseEvent, r: number, c: number) {
    if (!showToolbar) return;

    e.preventDefault();
    e.stopPropagation();
    gridActiveRef.current = true;

    suppressFocusSelectionRef.current = true;

    // ✅ 셀 우클릭이면 행 선택 해제
    clearRowSelection();

    // ✅ "현재 선택" 판정은 range state가 아니라 ref 기준(우클릭 순간 선택이 사라지는 현상 방지)
    const cr = rangeRef.current;
    const inside =
      !!cr && r >= cr.r1 && r <= cr.r2 && c >= cr.c1 && c <= cr.c2;

    if (!inside) {
      selectSingle(r, c);
    } else {
      const p = { r, c };
      activeRef.current = p;
      setActive(p);
    }

    setMenu({ open: true, x: e.clientX, y: e.clientY, mode: "cell", baseRow: r });
  } 

  function handleEditorFocus(r: number, c: number) {
    // ✅ 드래그 중에는 focus 이벤트로 선택을 건드리지 않음(간헐 선택 깨짐 방지)
    if (draggingRef.current || rowDraggingRef.current) return;

    // gridActive만 켜두면 ctrl+c/v 처리가 됨
    gridActiveRef.current = true;

       const cr = rangeRef.current;
    const inside =
      !!cr && r >= cr.r1 && r <= cr.r2 && c >= cr.c1 && c <= cr.c2;

    if (suppressFocusSelectionRef.current) {
      suppressFocusSelectionRef.current = false;
      if (inside) {
        const p = { r, c };
        activeRef.current = p;
        setActive(p);
        return;
      }
    }

    if (inside) {
      const p = { r, c };
      activeRef.current = p;
      setActive(p);
      return;
    }

    clearRowSelection();
    selectSingle(r, c);
  }

  // ✅ 전역 키/붙여넣기(엑셀 느낌) — 포커스가 input/select에 있어도 동작하게
  useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
      if (!showToolbar) return;

      const cols = selectedColumnsRef.current;
      if (!cols.length) return;

      // ✅ gridActiveRef가 간헐적으로 false가 되는 케이스(포커스 이동/편집기/우클릭 등)에서도
      // "현재 키 입력이 그리드 내부에서 발생"하면 동작하도록 보강
      const root = rootRef.current;
      const targetNode = (e.target as unknown as Node) || null;
      const activeEl = (typeof document !== "undefined" ? (document.activeElement as unknown as Node) : null) || null;

      const insideByTarget = !!root && !!targetNode && root.contains(targetNode);
      const insideByFocus = !!root && !!activeEl && root.contains(activeEl);

      if (!gridActiveRef.current && !insideByTarget && !insideByFocus) return;

      // 내부에서 키가 들어온 게 확실하면 active로 간주
      gridActiveRef.current = true;

      const key = (e.key || "").toLowerCase();
      const isMod = e.ctrlKey || e.metaKey;
      // Delete
      if (key === "delete") {
        const rr = rowRangeRef.current;
        const cr = rangeRef.current;
        if (!rr && !cr) return;
        e.preventDefault();
        e.stopPropagation();
        clearSelectionValues();
        return;
      }

      // Ctrl/Cmd+C
      if (isMod && key === "c") {
        const rr = rowRangeRef.current;
        const cr = rangeRef.current;
        if (!rr && !cr) return;
        e.preventDefault();
        e.stopPropagation();
        void copySelection();
        return;
      }

            // Ctrl/Cmd+V
      if (isMod && key === "v") {
        const start = getSelectionTopLeft();
        if (!start) return;

        // ✅ 기본 입력 컴포넌트로 이벤트가 흘러가서 "한 셀에 몰림"이 생기는 케이스 차단
        e.preventDefault();
        e.stopPropagation();

        // 1) 우선 textarea로 포커스 이동 → paste 이벤트를 최대한 안정적으로 받는다
        focusGridForPaste();

        // 2) 일부 브라우저/상황에서 paste 이벤트가 안 잡히는 경우가 있어 fallback 1회
        const requestedAt = Date.now();
        if (pasteFallbackTimerRef.current) window.clearTimeout(pasteFallbackTimerRef.current);

        pasteFallbackTimerRef.current = window.setTimeout(async () => {
          // paste 이벤트가 이미 처리되었으면 fallback 취소
          if (lastPasteHandledAtRef.current >= requestedAt) return;

          const text = (await safeReadClipboardText().catch(() => "")) || lastCopiedRef.current || "";
          const finalText =
            text || window.prompt("붙여넣을 내용을 여기에 Ctrl+V로 붙여넣고 확인을 누르세요.") || "";

          if (!finalText) return;

          const matrix = parseTSV(finalText);
          pasteMatrixAt(start, matrix);
        }, 80);

        return;
      }

      // 방향키
      if (key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright") {
        // 입력 중 자연스러운 커서 이동을 방해하지 않도록:
        // 선택이 있거나(gridActive) 영역 선택 상태일 때만 막는다.
        const rr = rowRangeRef.current;
        const cr = rangeRef.current;
        if (!rr && !cr && !activeRef.current) return;

        e.preventDefault();
        e.stopPropagation();

        if (key === "arrowup") moveSelectionBy(-1, 0, e.shiftKey);
        if (key === "arrowdown") moveSelectionBy(1, 0, e.shiftKey);
        if (key === "arrowleft") moveSelectionBy(0, -1, e.shiftKey);
        if (key === "arrowright") moveSelectionBy(0, 1, e.shiftKey);

        return;
      }
    }

      function onPaste(e: ClipboardEvent) {
      if (!showToolbar) return;

      // ✅ keydown과 동일하게: gridActiveRef가 간헐적으로 false여도 "그리드 내부 이벤트"면 처리
      const root = rootRef.current;
      const targetNode = (e.target as unknown as Node) || null;
      const activeEl = (typeof document !== "undefined" ? (document.activeElement as unknown as Node) : null) || null;

      const insideByTarget = !!root && !!targetNode && root.contains(targetNode);
      const insideByFocus = !!root && !!activeEl && root.contains(activeEl);

      if (!gridActiveRef.current && !insideByTarget && !insideByFocus) return;

      gridActiveRef.current = true;

      const start = getSelectionTopLeft();
      if (!start) return;

      const text = e.clipboardData?.getData("text/plain") ?? e.clipboardData?.getData("text") ?? "";
      if (!text) return;

      // ✅ Ctrl+V fallback 타이머가 중복 실행되지 않게 "paste 처리됨" 기록
      lastPasteHandledAtRef.current = Date.now();

      e.preventDefault();
      e.stopPropagation();

      const matrix = parseTSV(text);
      pasteMatrixAt(start, matrix);
    }

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("paste", onPaste, true);

        return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("paste", onPaste, true);
      if (pasteFallbackTimerRef.current) window.clearTimeout(pasteFallbackTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToolbar]);

  async function handleSubmit(force: boolean) {
    onError("");

    if (selectedColumns.length === 0) {
      onError("저장할 컬럼을 먼저 선택해 주세요.");
      return;
    }

    const hasAny = rows.some((row) => {
      const data: Record<string, string> = {};
      for (const k of selectedColumns) data[k] = String(row?.[k] ?? "");
      return hasAnyValue(data);
    });

    if (!hasAny) {
      onError("저장할 데이터가 없습니다.");
      return;
    }

    setSubmitting(true);
    try {
      const j1 = await apiSignupTransfer({
        rows,
        selectedKeys: selectedColumns,
        force: !!force,
        confirmDuplicates: false,
      });

      // ✅ 추가출고 확인은 부모 모달에서 처리(강제전송 버튼 = "예")
      if (j1?.anyConfirmNeeded) {
        onTransferFailed?.("동일한 수취인에게 출고된(미반납된) 유축기가 있습니다\n추가 출고를 하시겠습니까?");
        return;
      }

      // 일반 실패(필수/중복출고 등)
      if (!j1?.ok) {
        const firstFail = Array.isArray(j1?.results) ? j1.results.find((x: any) => x && x.ok === false) : null;
        onTransferFailed?.((firstFail as any)?.reason || "저장(전송)에 실패했습니다.");
        return;
      }

      // 성공 처리(양식은 그대로, rows만 비움)
      syncEmitUnifiedUpdate();
      rowsTouchedRef.current = true;
      setRows((prev) => prev.map(() => ({})));
      await onSubmitSuccess?.();
    } catch (e: any) {
      onTransferFailed?.("저장(전송)에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  // 부모 모달의 "강제전송" 버튼이 forceSubmitToken을 +1 하면 여기서 감지해서 강제 전송 실행
  useEffect(() => {
    if (typeof forceSubmitToken !== "number") return;

    // 첫 세팅(마운트)은 트리거로 보지 않음
    if (lastForceSubmitTokenRef.current === null) {
      lastForceSubmitTokenRef.current = forceSubmitToken;
      return;
    }

    // 같은 값이면 무시
    if (forceSubmitToken === lastForceSubmitTokenRef.current) return;

    lastForceSubmitTokenRef.current = forceSubmitToken;

    // 이미 전송 중이면 무시
    if (submittingRef.current) return;

    void handleSubmit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceSubmitToken]);

  const btnBase =
    "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border rounded bg-slate-50 hover:bg-slate-100";
  const btnIcon = "text-slate-700";

  return (
    <div ref={rootRef} className="w-full flex flex-col gap-1.5 flex-1 min-h-0">
      <textarea
        ref={gridFocusRef}
        tabIndex={0}
        aria-hidden="true"
        className="absolute opacity-0 pointer-events-none"
        style={{ position: "fixed", left: -9999, top: 0, width: 1, height: 1 }}
      />

      {showToolbar && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" className={btnBase} onClick={add10Rows}>
              <span className={btnIcon}>
                <IconPlus />
              </span>
              행 10추가
            </button>

            <button type="button" className={btnBase} onClick={delete1RowFromBottom}>
              <span className={btnIcon}>
                <IconMinus />
              </span>
              행삭제
            </button>

            <button
              type="button"
              className={`${btnBase} ${resizeMode ? "bg-slate-800 text-white hover:bg-slate-800" : ""}`}
              onClick={() => setResizeMode((v) => !v)}
            >
              <span className={resizeMode ? "text-white" : btnIcon}>
                <IconColumns />
              </span>
              열넓이
            </button>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
            onClick={() => handleSubmit(false)}
            disabled={submitting || loadingColumns}
          >
            <IconSend className="w-4 h-4" />
            {submitting ? "저장 중.." : "저장"}
          </button>
        </div>
      )}

      <div
        className="flex-1 min-h-0 border rounded bg-white overflow-auto"
        onMouseDown={() => {
          // 그리드 안을 클릭하면 활성화
          gridActiveRef.current = true;
        }}
      >
        {selectedColumns.length === 0 ? (
          <div className="p-3 text-xs text-slate-500">양식에서 컬럼을 선택하면 표가 생성됩니다.</div>
        ) : (
          <div className="min-w-max">
            <div className="flex border-b bg-slate-100 sticky top-0 z-10">
              {/* ✅ 행 번호(좌측) */}
              <div
                className="px-1 py-1.5 text-[12px] font-semibold text-slate-600 border-r select-none text-center sticky left-0 z-20 bg-slate-100"
                style={{ width: ROW_HEADER_W, minWidth: ROW_HEADER_W }}
                title="행"
              />

              {selectedColumns.map((k) => {
                const step = getStep(k);
                const widthPx = widthPxFromStep(step);

                return (
                  <div
                    key={k}
                    className="px-2 py-1.5 text-[12px] font-semibold text-slate-700 border-r last:border-r-0 select-none text-center"
                    style={{ width: widthPx, minWidth: MIN_WIDTH_PX }}
                    title={k}
                  >
                    <div className="truncate leading-5">{k}</div>

                    {resizeMode && (
                      <div className="mt-1 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          className="w-6 h-6 border rounded bg-white hover:bg-slate-50 text-xs"
                          onClick={() => setStep(k, step - 1)}
                        >
                          −
                        </button>
                        <div className="w-10 text-center text-[11px] tabular-nums">{step}</div>
                        <button
                          type="button"
                          className="w-6 h-6 border rounded bg-white hover:bg-slate-50 text-xs"
                          onClick={() => setStep(k, step + 1)}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
                            {rows.map((row, r) => {
                const rowSelected = isRowSelected(r);
                const rowHovered = hoverRow === r;

                return (
                  <div
                    key={r}
                    className={[
                      "flex border-b last:border-b-0",
                      rowSelected ? "bg-blue-50" : rowHovered ? "bg-slate-50" : "",
                    ].join(" ")}
                  >
                    {/* ✅ 행 번호 + 행 선택/드래그/우클릭 */}
                    <div
                      data-sg-row-header="1"
                      data-r={r}
                      className={[
                        "px-1 h-[26px] flex items-center justify-center text-[11px] select-none border-r",
                        rowSelected
                          ? "bg-blue-200 text-slate-800"
                          : rowHovered
                            ? "bg-slate-200 text-slate-700"
                            : "bg-slate-100 text-slate-500",
                        "sticky left-0 z-10",
                      ].join(" ")}
                      style={{ width: ROW_HEADER_W, minWidth: ROW_HEADER_W }}
                      onPointerDownCapture={(e) => {
                        if (e.button !== 0) return;
                        if (!showToolbar) return;

                        gridActiveRef.current = true;

                        // 행 선택 시작 → 셀 선택 해제
                        clearCellSelection();

                        rowDraggingRef.current = true;
                                      rowAnchorRef.current = r;
                                     setRowRangeSync(normalizeRowRange(r, r));

                                                const el = e.currentTarget as HTMLElement;
                        rowCaptureElRef.current = el;
                        rowCapturePointerIdRef.current = e.pointerId;
                        el.setPointerCapture(e.pointerId);
                        e.preventDefault();
                      }}
                      onPointerMoveCapture={(e) => {
                        if (!rowDraggingRef.current) return;

                        const rr = findRowFromPoint(e.clientX, e.clientY);
                        if (rr == null) return;

                        selectRowsFromAnchor(rr);
                      }}
                      onPointerUpCapture={(e) => {
                                               rowDraggingRef.current = false;
                        try {
                          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                        } catch {
                          // ignore
                        } finally {
                          rowCaptureElRef.current = null;
                          rowCapturePointerIdRef.current = null;
                        }
                      }}
                      
                       onMouseEnter={() => setHoverRow(r)}
                                    onMouseLeave={() => setHoverRow((cur) => (cur === r ? null : cur))}

                      onContextMenu={(e) => {
                        if (!showToolbar) return;
                        e.preventDefault();

                        gridActiveRef.current = true;

                        if (!isRowSelected(r)) {
                          selectRowSingle(r);
                        }

                        setMenu({ open: true, x: e.clientX, y: e.clientY, mode: "row", baseRow: r });
                      }}
                    >
                      {r + 1}
                    </div>

                    {selectedColumns.map((key, c) => {
                      const step = getStep(key);
                      const widthPx = widthPxFromStep(step);

                      const cellSelected = isSelectedCell(r, c);
                      const cellActive = active?.r === r && active?.c === c;

                      // ✅ 행 하이라이트가 셀 bg-white에 덮여서 안 보이던 문제 해결:
                      // - 기본은 bg-transparent
                      // - 셀 선택이면 bg-blue-50
                      // - 행 선택/hover이면 셀도 같이 색을 준다
                      const cellBg = cellSelected
                        ? "bg-blue-50"
                        : rowSelected
                          ? "bg-blue-50"
                          : rowHovered
                            ? "bg-slate-50"
                            : "bg-transparent";

                      return (
                        <div
                          key={`${r}-${key}`}
                          data-sg-cell="1"
                          data-r={r}
                          data-c={c}
                          className={[
                            "border-r last:border-r-0",
                            "relative",
                            cellBg,
                            cellActive ? "ring-2 ring-blue-400 ring-inset" : "",
                          ].join(" ")}
                          style={{ width: widthPx, minWidth: MIN_WIDTH_PX }}
                                                    onPointerDownCapture={(e) => handleCellPointerDown(e, r, c)}
                          onPointerMoveCapture={handleCellPointerMove}
                          onPointerUpCapture={handleCellPointerUp}
                          onMouseDownCapture={(e) => {
                            // ✅ contextmenu 이벤트(handleCellContextMenu)보다 먼저 들어오는 focus 때문에
                            // 선택영역이 깨지는 케이스 방지
                            if (e.button === 2) suppressFocusSelectionRef.current = true;
                          }}
                          onContextMenu={(e) => handleCellContextMenu(e, r, c)}
                        >
                          <CellEditor
                            columnKey={key}
                            value={String(row?.[key] ?? "")}
                            onFocus={() => handleEditorFocus(r, c)}
                            onChange={(v) => setCell(r, key, v)}
                            partnerOptions={partnerOptions || []}
                            onAddPartnerOption={onAddPartnerOption}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <ContextMenu
          open={menu.open}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu((m) => ({ ...m, open: false, baseRow: null }))}
          items={
            menu.mode === "row"
              ? [
                  {
                    label: "행 삽입",
                    onClick: () => {
                      const rr = rowRangeRef.current;
                      const base = menu.baseRow ?? (rr ? rr.r1 : 0);
                      const start = rr ? rr.r1 : base;
                      const count = rr ? rr.r2 - rr.r1 + 1 : 1;

                      insertRowsAt(start, count);
                      setMenu((m) => ({ ...m, open: false, baseRow: null }));
                    },
                  },
                  {
                    label: "행 삭제",
                    onClick: () => {
                      const rr = rowRangeRef.current;
                      if (!rr) {
                        const base = menu.baseRow ?? 0;
                        selectRowSingle(base);
                        setRowRangeSync(normalizeRowRange(base, base));
                      }

                      deleteSelectedRows();
                      setMenu((m) => ({ ...m, open: false, baseRow: null }));
                    },
                  },
                  {
                    label: "내용 지우기",
                    onClick: () => {
                      clearSelectionValues();
                      setMenu((m) => ({ ...m, open: false, baseRow: null }));
                    },
                  },
                  {
                    label: "복사",
                    onClick: async () => {
                      await copySelection();
                      setMenu((m) => ({ ...m, open: false, baseRow: null }));
                    },
                  },
                                    {
                    label: "붙여넣기",
                    onClick: async () => {
                      // 1) 일반 붙여넣기 시도
                      const start = getSelectionTopLeft();
                      if (!start) {
                        setMenu((m) => ({ ...m, open: false, baseRow: null }));
                        return;
                      }

                      const text = (await safeReadClipboardText()) || lastCopiedRef.current || "";

                      // 2) 브라우저 정책으로 readText가 실패하면 prompt fallback
                      const finalText =
                        text ||
                        window.prompt("붙여넣을 내용을 여기에 Ctrl+V로 붙여넣고 확인을 누르세요.") ||
                        "";

                      if (finalText) {
                        const matrix = parseTSV(finalText);
                        pasteMatrixAt(start, matrix);
                      }

                      setMenu((m) => ({ ...m, open: false, baseRow: null }));
                    },
                  },
                ]
              : [
                  {
                    label: "지우기",
                    onClick: () => {
                      clearSelectionValues();
                      setMenu((m) => ({ ...m, open: false, baseRow: null }));
                    },
                  },
                  {
                    label: "복사",
                    onClick: async () => {
                      await copySelection();
                      setMenu((m) => ({ ...m, open: false, baseRow: null }));
                    },
                  },
                  {
                    label: "붙여넣기",
                    onClick: async () => {
                      await pasteFromClipboard();
                      setMenu((m) => ({ ...m, open: false, baseRow: null }));
                    },
                  },
                ]
          }
        />
      </div>
    </div>
  );
}