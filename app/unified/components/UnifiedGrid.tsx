// app/unified/components/UnifiedGrid.tsx
"use client";

import type React from "react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  syncListen,
  syncPatch,
  syncEmitUnifiedUpdate,
} from "@/global-sync/sync-engine";
import { acquireLock, releaseLock } from "@/global-lock/lock-engine";

export type UnifiedGridHandle = {
  appendBlankRows: (count: number) => Promise<void>;
};

type UnifiedRow = { id: number; data: Record<string, any> };

const unifiedColumns = [
  "거래처분류",
  "상태",
  "안내분류",
  "구매/렌탈",
  "기기번호",
  "기종",
  "에러횟수",
  "제품",
  "수취인명",
  "연락처1",
  "연락처2",
  "계약자주소",
  "택배발송일",
  "시작일",
  "종료일",
  "반납요청일",
  "반납완료일",
  "특이사항1",
  "특이사항2",
  "총연장횟수",
  "신청일",
  "0차연장",
  "1차연장",
  "2차연장",
  "3차연장",
  "4차연장",
  "5차연장",
];

// 항상 DB에 최소로 유지할 실제 행 개수
const MIN_REAL_ROWS = 100;

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
};

const UnifiedGrid = forwardRef<UnifiedGridHandle, UnifiedGridProps>(
  function UnifiedGrid(props, ref) {
    const [rows, setRows] = useState<UnifiedRow[]>([]);
    const [myRowLocks, setMyRowLocks] = useState<Record<number, boolean>>({});

    // 열이동/열폭: "표시용 UI 상태" (DB/동기화와 무관)
    const isColumnEditMode = !!props.isColumnEditMode;

    const [columnOrder, setColumnOrder] = useState<string[]>(() => [
      ...unifiedColumns,
    ]);

    // 폭 unit: 20이 기준(기존 느낌), 1이면 1/20 수준
    const [colWidthUnitByKey, setColWidthUnitByKey] = useState<
      Record<string, number>
    >(() => {
      const obj: Record<string, number> = {};
      unifiedColumns.forEach((c) => (obj[c] = 20));
      return obj;
    });

    const viewColumns = columnOrder;

    function moveColLeft(key: string) {
      setColumnOrder((prev) => {
        const i = prev.indexOf(key);
        if (i <= 0) return prev;
        const next = [...prev];
        [next[i - 1], next[i]] = [next[i], next[i - 1]];
        return next;
      });
    }

    function moveColRight(key: string) {
      setColumnOrder((prev) => {
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
      setColWidthUnitByKey((prev) => ({ ...prev, [key]: safe }));
    }

    function getWidthPx(key: string) {
      // unit=20일 때 기존 체감에 맞추기(너무 커지지 않게 BASE를 보수적으로)
      const BASE = 140;
      const MIN = 40;
      const MAX = 420;
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

        const scrollRef = useRef<HTMLDivElement | null>(null);

    // 편집 중 syncListen이 들어오면 즉시 reload하지 않고 보류(입력 튕김 방지)
    const editingCellRef = useRef<{ rowId: number; key: string } | null>(null);
    const pendingReloadRef = useRef(false);

    // 컨텍스트 메뉴 위치 + 모드(row / cell)
    const [rowContextMenu, setRowContextMenu] = useState<{
      x: number;
      y: number;
    } | null>(null);
    const [contextMenuMode, setContextMenuMode] = useState<"row" | "cell">(
      "row"
    );

    /* --------------------- 최소 100개 실제 행 확보 --------------------- */
    async function ensureMinRows() {
      const r = await fetch("/api/unified", { cache: "no-store" });
      let data: UnifiedRow[] = await r.json();

      if (data.length < MIN_REAL_ROWS) {
        const need = MIN_REAL_ROWS - data.length;
        for (let i = 0; i < need; i++) {
          await fetch("/api/unified", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
        }
        const r2 = await fetch("/api/unified", { cache: "no-store" });
        data = await r2.json();
      }

      setRows(data);
    }

    /* --------------------- 소켓 연결 --------------------- */
        useEffect(() => {
      const stop = syncListen(() => {
        if (editingCellRef.current) {
          pendingReloadRef.current = true; // 편집 끝나면 reload
          return;
        }
        reload();
      });
      return () => stop();
    }, []);

    /* --------------------- 최초 로딩 --------------------- */
    useEffect(() => {
      ensureMinRows();
    }, []);

    /* --------------------- reload --------------------- */
    async function reload() {
      await ensureMinRows();
    }

    /* --------------------- 외부에서 행 추가 호출 --------------------- */
    async function appendBlankRows(count: number) {
      if (count <= 0) return;
      for (let i = 0; i < count; i++) {
        await fetch("/api/unified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      }
      syncEmitUnifiedUpdate();
      await reload();
    }

    useImperativeHandle(
      ref,
      () => ({
        appendBlankRows,
      }),
      []
    );

    /* --------------------- 로컬 셀 값 반영 --------------------- */
    function updateLocalCell(id: number, key: string, value: string) {
      setRows((prev) =>
        prev.map((row) =>
          row.id === id ? { ...row, data: { ...row.data, [key]: value } } : row
        )
      );
    }

    /* --------------------- 셀 저장 --------------------- */
    async function saveCell(id: number, key: string, value: string) {
      await syncPatch(id, key, value);
    }

    /* --------------------- 포커스 시 락 획득 --------------------- */
     async function handleFocus(rowId: number, key: string, e: any) {
      const result = await acquireLock("unified", rowId);

      if (result.ok) {
        setMyRowLocks((prev) => ({ ...prev, [rowId]: true }));
        editingCellRef.current = { rowId, key };
        return;
      }

      if (result.reason === "locked_by_other" && (result as any).lock) {
        const lock = (result as any).lock;
        alert(`${lock.locked_by_name}님이 이 행을 편집 중입니다.`);
      } else if (result.reason === "unauthorized") {
        alert("로그인이 만료되었거나 권한이 없습니다. 다시 로그인해 주세요.");
      } else {
        alert("이 행을 편집할 수 없습니다. 잠시 후 다시 시도해 주세요.");
      }

      e.target.blur();
      reload();
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

    function setCellRangeByPoints(
      r1: number,
      c1: number,
      r2: number,
      c2: number
    ) {
      const startRow = Math.max(0, Math.min(r1, r2));
      const endRow = Math.min(rows.length - 1, Math.max(r1, r2));
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
      setRowContextMenu(null);
    }

    function handleCellMouseEnter(rowIndex: number, colIndex: number) {
      if (!isCellDragging || !cellDragAnchor) return;
      setCellRangeByPoints(
        cellDragAnchor.row,
        cellDragAnchor.col,
        rowIndex,
        colIndex
      );
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
      const safeEnd = Math.min(rows.length - 1, end);
      return {
        start: safeStart,
        end: safeEnd,
        slice: rows.slice(safeStart, safeEnd + 1),
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

    /* --------------------- 행 삽입 (선택 범위 위치에 N행, 완전 빈행) --------------------- */

    async function handleInsertRows() {
      let { start, end } = getSelectedRowRangeInfo();

      // 선택이 없으면 현재 selectedRowRange 사용
      if (end < start) {
        if (!selectedRowRange) {
          setRowContextMenu(null);
          return;
        }
        start = selectedRowRange.start;
        end = selectedRowRange.end;
      }

      const oldLen = rows.length;
      if (oldLen === 0) {
        await appendBlankRows(1);
        setRowContextMenu(null);
        return;
      }

      const N = Math.max(1, end - start + 1); // 삽입할 행 개수

      // 1) 새 빈 행 N개를 DB에 추가 (맨 아래)
      //    → 깜빡임 줄이기 위해 여기서는 reload / syncEmitUnifiedUpdate를 호출하지 않음
      for (let i = 0; i < N; i++) {
        await fetch("/api/unified", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      }

      // 2) 최신 rows 다시 조회 (id ASC)
      const r = await fetch("/api/unified", { cache: "no-store" });
      const all: UnifiedRow[] = await r.json();
      const L = all.length; // = oldLen + N
      const baseLen = L - N; // 삽입 전 실제 행 개수 (= oldLen)

      // 기존 데이터 스냅샷: "삽입 전" 기준 데이터
      const baseData: Record<string, any>[] = new Array(baseLen);
      for (let i = 0; i < baseLen; i++) {
        baseData[i] = { ...(all[i]?.data ?? {}) };
      }

      // 3) "id 순서는 그대로, data만 재배치 (start 위치에 N행 끼워 넣기)"
      const finalData: Record<string, any>[] = new Array(L);
      for (let i = 0; i < L; i++) {
        if (i < start) {
          // 삽입 위치 위: 기존 데이터 그대로
          finalData[i] = { ...(baseData[i] ?? {}) };
        } else if (i >= start && i < start + N) {
          // 삽입된 N행: 모든 통합관리 컬럼을 빈 문자열로 채운 완전 빈 행
          finalData[i] = createEmptyData();
        } else {
          // 삽입 위치 아래: 기존 데이터가 N칸 아래로 밀림
          const srcIndex = i - N;
          finalData[i] = { ...(baseData[srcIndex] ?? {}) };
        }
      }

      // 4) 화면 먼저 반영
      const next: UnifiedRow[] = all.map((row, idx) => ({
        ...row,
        data: finalData[idx] ?? {},
      }));
      setRows(next);

      // 5) DB에 변경된 행만 PATCH
      const updates: { id: number; data: Record<string, any> }[] = [];
      for (let i = 0; i < L; i++) {
        const before = all[i]?.data ?? {};
        const after = finalData[i] ?? {};
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          updates.push({ id: all[i].id, data: after });
        }
      }

      for (const u of updates) {
        await fetch(`/api/unified/${u.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(u.data),
        });
      }

      // 6) 다른 탭에 알림 (최종 1번만)
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
          if (rowIndex >= rows.length - 1) return;
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
            // 마지막 컬럼에서 → : 다음 행 첫 컬럼
            if (rowIndex >= rows.length - 1) return;
            targetRow = rowIndex + 1;
            targetCol = 0;
          }
          break;
        }
        case "ArrowLeft": {
          if (colIndex > 0) {
            targetCol = colIndex - 1;
          } else {
            // 첫 컬럼에서 ← : 위 행 마지막 컬럼
            if (rowIndex <= 0) return;
            targetRow = rowIndex - 1;
            targetCol = viewColumns.length - 1;
          }
          break;
        }
        default:
          return; // 다른 키는 기본 동작 유지
      }

      if (focusCell(targetRow, targetCol)) {
        e.preventDefault();
      }
    }

    /* --------------------- 행 삭제 --------------------- */

    async function handleDeleteSelectedRows() {
      const { slice } = getSelectedRowRangeInfo();
      if (!slice.length) {
        setRowContextMenu(null);
        return;
      }

      for (const row of slice) {
        await fetch(`/api/unified/${row.id}`, {
          method: "DELETE",
        });
      }

      syncEmitUnifiedUpdate();
      setRowContextMenu(null);
      setSelectedRowRange(null);
      await reload();
    }

    /* --------------------- 내용 지우기 (셀/행 단위 PATCH) --------------------- */

    async function handleClearSelectedRows() {
      // 1) 셀 범위가 있으면 셀만 지우기
      if (selectedCellRange) {
        const { startRow, endRow, startCol, endCol } = selectedCellRange;

        const next = [...rows];
        const updates: { id: number; data: Record<string, any> }[] = [];

        for (let rIndex = startRow; rIndex <= endRow; rIndex++) {
          const row = next[rIndex];
          if (!row) continue;

          const newData: Record<string, any> = { ...row.data };
          for (let cIndex = startCol; cIndex <= endCol; cIndex++) {
            const colKey = viewColumns[cIndex];
            if (colKey) newData[colKey] = "";
          }
          next[rIndex] = { ...row, data: newData };
          updates.push({ id: row.id, data: newData });
        }

        setRows(next);

        for (const u of updates) {
          await fetch(`/api/unified/${u.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(u.data),
          });
        }

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

      const updates: { id: number; data: Record<string, any> }[] = [];
      const next = [...rows];

      for (let i = start; i <= end; i++) {
        const row = next[i];
        if (!row) continue;

        const newData: Record<string, any> = { ...row.data };
        viewColumns.forEach((key) => {
          newData[key] = "";
        });

        next[i] = { ...row, data: newData };
        updates.push({ id: row.id, data: newData });
      }

      setRows(next);

      for (const u of updates) {
        await fetch(`/api/unified/${u.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(u.data),
        });
      }

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
          const row = rows[rIndex];
          if (!row) continue;
          const cells: string[] = [];
          for (let cIndex = startCol; cIndex <= endCol; cIndex++) {
            const colKey = viewColumns[cIndex];
            const v = (row.data[colKey] ?? "") as string;
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
    viewColumns.map((key) => (row.data[key] ?? "") as string).join("\t")
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

    async function handlePasteToSelectedRowsFromClipboard() {
      let baseRowIndex: number;
      let baseColIndex: number;

      if (selectedCellRange) {
        baseRowIndex = selectedCellRange.startRow;
        baseColIndex = selectedCellRange.startCol;
      } else {
        const { start } = getSelectedRowRangeInfo();
        baseRowIndex = start >= 0 ? start : 0;
        baseColIndex = 0;
      }

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

      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0);

      if (!lines.length) {
        setRowContextMenu(null);
        return;
      }

      const parsed = lines.map((line) => line.split("\t"));
      const lineCount = parsed.length;

      const requiredRowCount = baseRowIndex + lineCount;

      if (requiredRowCount > rows.length) {
        const need = requiredRowCount - rows.length;
        await appendBlankRows(need);
      }

      const r = await fetch("/api/unified", { cache: "no-store" });
      const fresh: UnifiedRow[] = await r.json();

      const next = [...fresh];
      const updates: { id: number; data: Record<string, any> }[] = [];

      for (let rowOffset = 0; rowOffset < lineCount; rowOffset++) {
        const rowIndex = baseRowIndex + rowOffset;
        const row = next[rowIndex];
        if (!row) continue;

        const srcRow = parsed[rowOffset];
        const newData: Record<string, any> = { ...row.data };

        for (let colOffset = 0; colOffset < srcRow.length; colOffset++) {
          const colIndex = baseColIndex + colOffset;
          if (colIndex >= viewColumns.length) break;
          const key = viewColumns[colIndex];
          const v = srcRow[colOffset] ?? "";
          newData[key] = v;
        }

        next[rowIndex] = { ...row, data: newData };
        updates.push({ id: row.id, data: newData });
      }

      setRows(next);

      for (const u of updates) {
        await fetch(`/api/unified/${u.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(u.data),
        });
      }

      syncEmitUnifiedUpdate();
      setRowContextMenu(null);
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
          if (
            target.closest('[data-row-header="1"]') ||
            target.closest('[data-context-menu="1"]')
          )
            return;
          setSelectedRowRange(null);
          setSelectedCellRange(null);
          setRowContextMenu(null);
        }}
      >
        <div
          ref={scrollRef}
          className="border-t border-x bg-white w-full flex-1 overflow-auto"
        >
          <table className="w-full min-w-[2800px] table-fixed border-collapse text-xs">
           {isColumnEditMode && (
  <colgroup>
    <col style={{ width: 40 }} />
    {viewColumns.map((c) => (
      <col key={c} style={{ width: getWidthPx(c) }} />
    ))}
  </colgroup>
)}
           <thead className="bg-gray-100 sticky top-0 z-10">
  <tr>
    <th className="border px-1 py-[3px] w-10 bg-gray-100" />
    {viewColumns.map((c, idx) => (
      <th key={c} className="border px-2 py-1 align-top">
        <div className="flex flex-col items-center gap-1">
          <div className="w-full text-center text-[11px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {c}
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
              {rows.map((row, rowIndex) => {
                const rowSelected = isRowSelected(rowIndex);

                const headerCellBase =
                  "border px-1 py-[3px] text-[0.68rem] text-center select-none" +
                  (rowSelected
                    ? " bg-blue-200 text-gray-800"
                    : " bg-gray-100 text-gray-500");

                return (
                  <tr key={row.id}>
                    <td
                      className={headerCellBase}
                      data-row-header="1"
                      data-row-index={rowIndex}
                      onMouseDown={(e) =>
                        handleRowHeaderMouseDown(rowIndex, e)
                      }
                      onMouseEnter={() => handleRowHeaderMouseEnter(rowIndex)}
                      onContextMenu={(e) =>
                        handleRowHeaderContextMenu(rowIndex, e)
                      }
                    >
                      {rowIndex + 1}
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
                          onMouseDown={(e) =>
                            handleCellMouseDown(rowIndex, colIndex, e)
                          }
                          onMouseEnter={() =>
                            handleCellMouseEnter(rowIndex, colIndex)
                          }
                          onContextMenu={(e) =>
                            handleCellContextMenu(rowIndex, colIndex, e)
                          }
                        >
                          <input
                            className="w-full text-xs bg-transparent outline-none"
                            value={row.data[key] ?? ""}
                            data-row={rowIndex}
                            data-col={colIndex}
                            onFocus={(e) => handleFocus(row.id, key, e)}
                            onChange={(e) => {
                              if (!myRowLocks[row.id]) return;
                              updateLocalCell(row.id, key, e.target.value);
                            }}
                            onBlur={async (e) => {
                              const v = e.target.value as string;

                             // 편집 종료 표시(이제 syncListen reload 허용)
                            editingCellRef.current = null;

                           // 락 없으면(=편집 권한 없음) 저장/해제 시도하지 않음
                          if (!myRowLocks[row.id]) {
                            if (pendingReloadRef.current) {
                             pendingReloadRef.current = false;
                             await reload();
                            }
                            return;
                          }

                         await saveCell(row.id, key, v);
                         await releaseLock("unified", row.id);

                         setMyRowLocks((prev) => {
                           const copy = { ...prev };
                           delete copy[row.id];
                           return copy;
                         });

                        if (pendingReloadRef.current) {
                        pendingReloadRef.current = false;
                        await reload();
                        }
                       }}
                            onKeyDown={(e) =>
                              handleCellKeyDown(e, rowIndex, colIndex)
                            }
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