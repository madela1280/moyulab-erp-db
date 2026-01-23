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

  // ✅ 행 선택(왼쪽 번호 컬럼) 전용
  const [rowRange, setRowRange] = useState<RowRange | null>(null);
  const rowDraggingRef = useRef(false);
  const rowAnchorRef = useRef<number | null>(null);

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

  // ✅ 붙여넣기/키보드 입력 안정화를 위해 실제 포커스 대상은 textarea
  const gridFocusRef = useRef<HTMLTextAreaElement | null>(null);

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

      // 선택/포커스는 유지해도 되지만, 점멸/오동작 방지 위해 range만 최소 정리
      draggingRef.current = false;
      rowDraggingRef.current = false;
      rowAnchorRef.current = null;
      anchorRef.current = null;
      activeRef.current = null;
      setRange(null);
      setAnchor(null);
      setActive(null);
      setRowRange(null);

      // 다음 rows effect에서 1회만 차단 후 자동 해제
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

  useEffect(() => {
    const onPointerUp = () => {
      draggingRef.current = false;

      // ✅ 행 드래그도 강제 종료(포인터가 header 밖에서 up 되는 케이스)
      rowDraggingRef.current = false;
      rowAnchorRef.current = null;
    };
    window.addEventListener("pointerup", onPointerUp);
    return () => window.removeEventListener("pointerup", onPointerUp);
  }, []);

  useEffect(() => {
    const onWindowDown = () => {
      if (menu.open) setMenu((m) => ({ ...m, open: false, baseRow: null }));
    };
    window.addEventListener("mousedown", onWindowDown);
    return () => window.removeEventListener("mousedown", onWindowDown);
  }, [menu.open]);

  function focusGrid() {
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
    setRange(null);
    setAnchor(null);
    setActive(null);

    rowDraggingRef.current = false;
    rowAnchorRef.current = at;
    setRowRange(normalizeRowRange(at, at + n - 1));
  }

  function deleteSelectedRows() {
    if (!rowRange) return;

    updateRows((prev) => {
      const next = prev.slice();
      next.splice(rowRange.r1, rowRange.r2 - rowRange.r1 + 1);
      if (next.length === 0) return [{}];
      return next;
    });

    draggingRef.current = false;
    anchorRef.current = null;
    activeRef.current = null;
    setRange(null);
    setAnchor(null);
    setActive(null);

    rowDraggingRef.current = false;
    rowAnchorRef.current = null;
    setRowRange(null);
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
    setRowRange(null);
  }

  function clearCellSelection() {
    draggingRef.current = false;
    anchorRef.current = null;
    activeRef.current = null;
    setRange(null);
    setAnchor(null);
    setActive(null);
  }

  function selectSingle(r: number, c: number) {
    const p = { r, c };
    activeRef.current = p;
    anchorRef.current = p;

    setActive(p);
    setAnchor(p);
    setRange(normalizeRange(p, p));
  }

  function selectFromAnchor(to: CellPos) {
    const a = anchorRef.current;

    if (!a) {
      anchorRef.current = to;
      activeRef.current = to;
      setAnchor(to);
      setActive(to);
      setRange(normalizeRange(to, to));
      return;
    }

    activeRef.current = to;
    setActive(to);
    setRange(normalizeRange(a, to));
  }

  function isRowSelected(r: number) {
    if (!rowRange) return false;
    return r >= rowRange.r1 && r <= rowRange.r2;
  }

  function selectRowSingle(r: number) {
    rowAnchorRef.current = r;
    setRowRange(normalizeRowRange(r, r));
  }

  function selectRowsFromAnchor(toRow: number) {
    const a = rowAnchorRef.current;
    if (a == null) {
      rowAnchorRef.current = toRow;
      setRowRange(normalizeRowRange(toRow, toRow));
      return;
    }
    setRowRange(normalizeRowRange(a, toRow));
  }

  function isSelectedCell(r: number, c: number) {
    if (!range) return false;
    return r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
  }

  function getSelectionTopLeft(): CellPos | null {
    // ✅ 행 선택이 우선이면, 붙여넣기 시작점은 (첫 선택행, 첫 컬럼)
    if (rowRange) return { r: rowRange.r1, c: 0 };

    if (range) return { r: range.r1, c: range.c1 };
    if (active) return active;
    return null;
  }

  function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
  }

  function getMoveBaseCell(): CellPos {
    if (active) return active;
    const tl = getSelectionTopLeft();
    if (tl) return tl;
    return { r: 0, c: 0 };
  }

  function focusCellEditor(r: number, c: number) {
    if (typeof document === "undefined") return;

    const cell = document.querySelector(`[data-sg-cell="1"][data-r="${r}"][data-c="${c}"]`) as HTMLElement | null;
    if (!cell) return;

    // 스크롤 가시영역으로 이동(엑셀 느낌)
    try {
      cell.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {
      // ignore
    }

    // 내부 editor로 포커스 이동
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
    if (selectedColumns.length === 0) return;
    if (rows.length === 0) return;

    // 행 선택 중이면 "행" 이동이 아니라 셀 이동으로 전환(엑셀 느낌)
    if (rowRange) {
      clearRowSelection();
      selectSingle(rowRange.r1, 0);
    }

    const base = getMoveBaseCell();

    const nextR = clamp(base.r + dr, 0, rows.length - 1);
    const nextC = clamp(base.c + dc, 0, selectedColumns.length - 1);

    if (expand) {
      selectFromAnchor({ r: nextR, c: nextC });
    } else {
      selectSingle(nextR, nextC);
    }

    focusCellEditor(nextR, nextC);
  }

  async function copySelection() {
    if (selectedColumns.length === 0) return;

    // ✅ 행 선택 복사: 선택된 행들 *전체 컬럼*을 TSV로
    if (rowRange) {
      const matrix: string[][] = [];
      for (let r = rowRange.r1; r <= rowRange.r2; r++) {
        const row = rows[r] || {};
        const line = selectedColumns.map((k) => String(row?.[k] ?? ""));
        matrix.push(line);
      }
      const text = toTSV(matrix);
      lastCopiedRef.current = text;
      await safeWriteClipboardText(text);
      return;
    }

    // ✅ 셀 선택 복사
    if (!range) return;

    const matrix: string[][] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row = rows[r] || {};
      const line: string[] = [];
      for (let c = range.c1; c <= range.c2; c++) {
        const key = selectedColumns[c];
        line.push(String(row?.[key] ?? ""));
      }
      matrix.push(line);
    }

    const text = toTSV(matrix);
    lastCopiedRef.current = text;
    await safeWriteClipboardText(text);
  }

  function clearSelectionValues() {
    if (selectedColumns.length === 0) return;

    // ✅ 행 선택: 선택 행의 모든 컬럼 지우기
    if (rowRange) {
      rowsTouchedRef.current = true;
      setRows((prev) => {
        const next = prev.slice();
        for (let r = rowRange.r1; r <= rowRange.r2; r++) {
          const base = { ...(next[r] || {}) };
          for (const key of selectedColumns) base[key] = "";
          next[r] = base;
        }
        return next;
      });
      return;
    }

    // ✅ 셀 선택
    if (!range) return;

    rowsTouchedRef.current = true;
    setRows((prev) => {
      const next = prev.slice();
      for (let r = range.r1; r <= range.r2; r++) {
        const base = { ...(next[r] || {}) };
        for (let c = range.c1; c <= range.c2; c++) {
          const key = selectedColumns[c];
          base[key] = "";
        }
        next[r] = base;
      }
      return next;
    });
  }

  function pasteMatrixAt(start: CellPos, matrix: string[][]) {
    if (selectedColumns.length === 0) return;
    if (matrix.length === 0) return;

    rowsTouchedRef.current = true;

    const needRows = start.r + matrix.length;
    ensureRowsCount(needRows);

    setRows((prev) => {
      const next = prev.slice();
      for (let rr = 0; rr < matrix.length; rr++) {
        const rIndex = start.r + rr;
        const base = { ...(next[rIndex] || {}) };

        for (let cc = 0; cc < matrix[rr].length; cc++) {
          const cIndex = start.c + cc;
          if (cIndex >= selectedColumns.length) break;
          const key = selectedColumns[cIndex];
          base[key] = String(matrix[rr][cc] ?? "");
        }

        next[rIndex] = base;
      }
      return next;
    });
  }

  async function pasteFromClipboard() {
    const start = getSelectionTopLeft();
    if (!start) return;

    const text = (await safeReadClipboardText()) || lastCopiedRef.current || "";
    if (!text) return;

    const matrix = parseTSV(text);
    pasteMatrixAt(start, matrix);
  }

  function handleKeyDownCapture(e: React.KeyboardEvent) {
    if (!showToolbar) return;

    const k = e.key;

    // 방향키: input/select가 먹기 전에 capture 단계에서 먼저 처리
    if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();

      if (k === "ArrowUp") moveSelectionBy(-1, 0, e.shiftKey);
      if (k === "ArrowDown") moveSelectionBy(1, 0, e.shiftKey);
      if (k === "ArrowLeft") moveSelectionBy(0, -1, e.shiftKey);
      if (k === "ArrowRight") moveSelectionBy(0, 1, e.shiftKey);

      return;
    }

    const lower = k.toLowerCase();

    if (lower === "delete") {
      if (range || rowRange) {
        e.preventDefault();
        clearSelectionValues();
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && lower === "c") {
      e.preventDefault();
      void copySelection();
      return;
    }

    // ctrl+v는 브라우저 paste 이벤트가 더 안정적이라 여기선 막지 않음
  }

  function handlePasteCapture(e: React.ClipboardEvent) {
    if (!showToolbar) return;

    const start = getSelectionTopLeft();
    if (!start) return;

    const text = e.clipboardData.getData("text");
    if (!text) return;

    const matrix = parseTSV(text);
    e.preventDefault();
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

      const baseCol =
        activeRef.current?.c ?? anchorRef.current?.c ?? active?.c ?? anchor?.c ?? 0;

      const safeCol = Math.max(0, Math.min(selectedColumns.length - 1, Math.floor(baseCol)));
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

    // ✅ 행번호 영역 위에서도 row를 잡을 수 있게
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

    focusGrid();

    // ✅ 셀 선택을 시작하면 행 선택은 해제
    clearRowSelection();

    draggingRef.current = true;

    const p = { r, c };
    anchorRef.current = p;
    activeRef.current = p;

    setAnchor(p);
    setActive(p);
    setRange(normalizeRange(p, p));

    const t = e.target as HTMLElement | null;
    const tag = t?.tagName?.toUpperCase?.() ?? "";
    const isInteractive =
      tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || (t as any)?.isContentEditable;

    if (!isInteractive) e.preventDefault();

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleCellPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const p = findCellFromPoint(e.clientX, e.clientY);
    if (!p) return;
    selectFromAnchor(p);
  }

  function handleCellPointerUp(e: React.PointerEvent) {
    draggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function handleCellContextMenu(e: React.MouseEvent, r: number, c: number) {
    if (!showToolbar) return;

    e.preventDefault();
    focusGrid();

    suppressFocusSelectionRef.current = true;

    // ✅ 셀 우클릭이면 행 선택 해제
    clearRowSelection();

    if (!isSelectedCell(r, c)) {
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

    if (suppressFocusSelectionRef.current) {
      suppressFocusSelectionRef.current = false;
      if (range && isSelectedCell(r, c)) {
        const p = { r, c };
        activeRef.current = p;
        setActive(p);
        return;
      }
    }

    if (range && isSelectedCell(r, c)) {
      const p = { r, c };
      activeRef.current = p;
      setActive(p);
      return;
    }

    // focus로 들어오면 행 선택 해제 + 셀 단일 선택
    clearRowSelection();
    selectSingle(r, c);
  }

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
        const firstFail = Array.isArray(j1?.results)
          ? j1.results.find((x: any) => x && x.ok === false)
          : null;

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
    <div
      className="w-full flex flex-col gap-1.5 flex-1 min-h-0"
      onKeyDownCapture={handleKeyDownCapture}
      onPasteCapture={handlePasteCapture}
    >
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

      <div className="flex-1 min-h-0 border rounded bg-white overflow-auto">
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
                    onMouseEnter={() => setHoverRow(r)}
                    onMouseLeave={() => setHoverRow((cur) => (cur === r ? null : cur))}
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

                        focusGrid();

                        // 행 선택 시작 → 셀 선택 해제
                        clearCellSelection();

                        rowDraggingRef.current = true;
                        rowAnchorRef.current = r;
                        setRowRange(normalizeRowRange(r, r));

                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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
                        }
                      }}
                      onContextMenu={(e) => {
                        if (!showToolbar) return;
                        e.preventDefault();
                        focusGrid();

                        // 우클릭 행이 선택 밖이면 단일 행 선택으로 맞춤
                        if (!isRowSelected(r)) {
                          clearCellSelection();
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

                      const selected = range ? r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2 : false;
                      const isActive = active?.r === r && active?.c === c;

                      return (
                        <div
                          key={`${r}-${key}`}
                          data-sg-cell="1"
                          data-r={r}
                          data-c={c}
                          className={[
                            "border-r last:border-r-0",
                            "relative",
                            selected ? "bg-blue-50" : "bg-white",
                            isActive ? "ring-2 ring-blue-400 ring-inset" : "",
                          ].join(" ")}
                          style={{ width: widthPx, minWidth: MIN_WIDTH_PX }}
                          onPointerDownCapture={(e) => handleCellPointerDown(e, r, c)}
                          onPointerMoveCapture={handleCellPointerMove}
                          onPointerUpCapture={handleCellPointerUp}
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
                      const base = menu.baseRow ?? (rowRange ? rowRange.r1 : 0);
                      const start = rowRange ? rowRange.r1 : base;
                      const count = rowRange ? rowRange.r2 - rowRange.r1 + 1 : 1;

                      insertRowsAt(start, count);
                      setMenu((m) => ({ ...m, open: false, baseRow: null }));
                    },
                  },
                  {
                    label: "행 삭제",
                    onClick: () => {
                      if (!rowRange) {
                        const base = menu.baseRow ?? 0;
                        clearCellSelection();
                        selectRowSingle(base);
                        setRowRange(normalizeRowRange(base, base));
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
                      await pasteFromClipboard();
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

