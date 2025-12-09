// app/unified/components/UnifiedGrid.tsx
"use client";

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

type UnifiedGridProps = {};

const UnifiedGrid = forwardRef<UnifiedGridHandle, UnifiedGridProps>(
  function UnifiedGrid(_props, ref) {
    const [rows, setRows] = useState<UnifiedRow[]>([]);
    const [myRowLocks, setMyRowLocks] = useState<Record<number, boolean>>({});

    // 행 범위 선택 상태
    const [selectedRowRange, setSelectedRowRange] = useState<{
      start: number;
      end: number;
    } | null>(null);
    const [isRowDragging, setIsRowDragging] = useState(false);
    const [rowDragAnchor, setRowDragAnchor] = useState<number | null>(null);

    const scrollRef = useRef<HTMLDivElement | null>(null);

    // 행 컨텍스트 메뉴
    const [rowContextMenu, setRowContextMenu] = useState<{
      x: number;
      y: number;
    } | null>(null);

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
      const stop = syncListen(() => reload());
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
    async function handleFocus(rowId: number, e: any) {
      const result = await acquireLock("unified", rowId);

      if (result.ok) {
        setMyRowLocks((prev) => ({ ...prev, [rowId]: true }));
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

        /* --------------------- 행 삽입 (선택 범위 아래에 N행, 완전 빈행) --------------------- */

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

      const old = rows;
      const oldLen = old.length;
      if (oldLen === 0) {
        await appendBlankRows(1);
        setRowContextMenu(null);
        return;
      }

      const N = Math.max(1, end - start + 1); // 삽입할 행 개수
      const insertPos = end; // 이 인덱스 '아래'에 삽입 (0-based)

      // 선택 범위가 마지막 행까지 포함되면, 단순히 맨 아래에만 추가
      if (insertPos >= oldLen - 1) {
        await appendBlankRows(N);
        setRowContextMenu(null);
        return;
      }

      // 1) 새 빈 행 N개를 DB에 추가 (맨 아래)
      await appendBlankRows(N);

      // 2) 최신 rows 다시 조회 (id ASC)
      const r = await fetch("/api/unified", { cache: "no-store" });
      const all: UnifiedRow[] = await r.json();
      const L = all.length;      // = oldLen + N
      const baseLen = L - N;     // 삽입 전 실제 행 개수 (= oldLen)

      // 기존 데이터 스냅샷: "삽입 전" 기준 데이터
      const baseData: Record<string, any>[] = new Array(baseLen);
      for (let i = 0; i < baseLen; i++) {
        baseData[i] = { ...(all[i]?.data ?? {}) };
      }

      // 3) "id 순서는 그대로, data만 재배치"
      const finalData: Record<string, any>[] = new Array(L);
      for (let i = 0; i < L; i++) {
        if (i <= insertPos) {
          // 삽입 위치 위: 기존 데이터 그대로
          finalData[i] = { ...(baseData[i] ?? {}) };
        } else if (i > insertPos && i <= insertPos + N) {
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

      // 6) 다른 탭에 알림
      syncEmitUnifiedUpdate();
      setRowContextMenu(null);
    }

// unifiedColumns 정의 바로 아래 등, 컴포넌트 밖에 추가
function createEmptyData(): Record<string, any> {
  const obj: Record<string, any> = {};
  unifiedColumns.forEach((key) => {
    obj[key] = "";
  });
  return obj;
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

    /* --------------------- 내용 지우기 (행 단위 PATCH) --------------------- */

    async function handleClearSelectedRows() {
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
        unifiedColumns.forEach((key) => {
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

    /* --------------------- 복사/붙여넣기 (행 단위 PATCH, 자동 행 추가) --------------------- */

    async function handleCopySelectedRowsToClipboard() {
      const { slice } = getSelectedRowRangeInfo();
      if (!slice.length) {
        setRowContextMenu(null);
        return;
      }

      const lines = slice.map((row) =>
        unifiedColumns
          .map((key) => (row.data[key] ?? "") as string)
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

    async function handlePasteToSelectedRowsFromClipboard() {
      const { start } = getSelectedRowRangeInfo();
      const baseRowIndex = start >= 0 ? start : 0;

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

      for (let offset = 0; offset < lineCount; offset++) {
        const rowIndex = baseRowIndex + offset;
        const row = next[rowIndex];
        if (!row) continue;

        const src = parsed[offset];
        const newData: Record<string, any> = { ...row.data };

        unifiedColumns.forEach((key, colIndex) => {
          const v = src[colIndex] ?? "";
          newData[key] = v;
        });

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
          setRowContextMenu(null);
        }}
      >
        <div
          ref={scrollRef}
          className="border-t border-x bg-white w-full flex-1 overflow-auto"
        >
          <table className="w-full min-w-[2800px] table-fixed border-collapse text-xs">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="border px-1 py-[3px] w-10 bg-gray-100" />
                {unifiedColumns.map((c) => (
                  <th key={c} className="border px-2 py-[3px]">
                    {c}
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

                const dataCellBase =
                  "border px-2 py-[3px]" +
                  (rowSelected ? " bg-blue-50" : " bg-white");

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

                    {unifiedColumns.map((key, colIndex) => (
                      <td
                        key={key}
                        className={dataCellBase}
                        data-row-index={rowIndex}
                        data-col-index={colIndex}
                      >
                        <input
                          className="w-full text-xs bg-transparent outline-none"
                          value={row.data[key] ?? ""}
                          onFocus={(e) => handleFocus(row.id, e)}
                          onChange={(e) => {
                            if (!myRowLocks[row.id]) return;
                            updateLocalCell(row.id, key, e.target.value);
                          }}
                          onBlur={(e) => {
                            saveCell(row.id, key, e.target.value);
                            releaseLock("unified", row.id);
                            setMyRowLocks((prev) => {
                              const copy = { ...prev };
                              delete copy[row.id];
                              return copy;
                            });
                          }}
                        />
                      </td>
                    ))}
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
          </div>
        )}
      </div>
    );
  }
);

export default UnifiedGrid;