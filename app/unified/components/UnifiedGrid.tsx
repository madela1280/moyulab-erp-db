"use client";

import { useEffect, useRef, useState } from "react";
import { syncListen, syncPatch } from "@/global-sync/sync-engine";
import {
  acquireLock,
  releaseLock,
} from "@/global-lock/lock-engine";

type UnifiedRow = { id: number; data: Record<string, any> };

const unifiedColumns = [
  "거래처분류","상태","안내분류","구매/렌탈","기기번호","기종","에러횟수","제품",
  "수취인명","연락처1","연락처2","계약자주소","택배발송일","시작일","종료일",
  "반납요청일","반납완료일","특이사항1","특이사항2","총연장횟수","신청일",
  "0차연장","1차연장","2차연장","3차연장","4차연장","5차연장"
];

export default function UnifiedGrid() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [myRowLocks, setMyRowLocks] = useState<Record<number, boolean>>({});

  // 행 범위 선택 상태
  const [selectedRowRange, setSelectedRowRange] = useState<{ start: number; end: number } | null>(null);
  const [isRowDragging, setIsRowDragging] = useState(false);
  const [rowDragAnchor, setRowDragAnchor] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 행 컨텍스트 메뉴
  const [rowContextMenu, setRowContextMenu] = useState<{ x: number; y: number } | null>(null);

  /* --------------------- 소켓 연결 --------------------- */
  useEffect(() => {
    const stop = syncListen(() => reload());
    return () => stop();
  }, []);

  /* --------------------- 최초 로딩 --------------------- */
  async function load() {
    const r = await fetch("/api/unified", { cache: "no-store" });
    const data = await r.json();
    setRows(data);
  }

  useEffect(() => {
    load();
  }, []);

  /* --------------------- reload --------------------- */
  async function reload() {
    const r = await fetch("/api/unified", { cache: "no-store" });
    const fresh = await r.json();
    setRows(fresh);
  }

  /* --------------------- 로컬 셀 값 반영 --------------------- */
  function updateLocalCell(id: number, key: string, value: string) {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, data: { ...row.data, [key]: value } }
          : row
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
    if (e.button !== 0) return; // 좌클릭만 선택/드래그
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

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
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
    return rowIndex >= selectedRowRange.start && rowIndex <= selectedRowRange.end;
  }

  /* --------------------- 선택된 행 범위 유틸 --------------------- */

  function getSelectedRowRangeInfo() {
    if (!selectedRowRange) return { start: 0, end: -1, slice: [] as UnifiedRow[] };
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
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

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

    setRowContextMenu(null);
    setSelectedRowRange(null);
    await reload();
  }

  async function handleClearSelectedRows() {
    const { start, end, slice } = getSelectedRowRangeInfo();
    if (!slice.length) {
      setRowContextMenu(null);
      return;
    }

    setRows((prev) => {
      const next = [...prev];
      for (let i = start; i <= end; i++) {
        const row = next[i];
        if (!row) continue;
        const newData = { ...row.data };
        unifiedColumns.forEach((key) => {
          newData[key] = "";
        });
        next[i] = { ...row, data: newData };
      }
      return next;
    });

    for (const row of slice) {
      for (const key of unifiedColumns) {
        await syncPatch(row.id, key, "");
      }
    }

    setRowContextMenu(null);
  }

  async function handleCopySelectedRowsToClipboard() {
    const { slice } = getSelectedRowRangeInfo();
    if (!slice.length) {
      setRowContextMenu(null);
      return;
    }

    const lines = slice.map((row) =>
      unifiedColumns.map((key) => (row.data[key] ?? "") as string).join("\t")
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
    const { start, slice } = getSelectedRowRangeInfo();
    if (!slice.length) {
      setRowContextMenu(null);
      return;
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

    const targetCount = slice.length;
    const sourceCount = parsed.length;

    // 로컬 상태 반영
    setRows((prev) => {
      const next = [...prev];
      for (let offset = 0; offset < targetCount; offset++) {
        const rowIndex = start + offset;
        const row = next[rowIndex];
        if (!row) continue;

        const src = parsed[offset % sourceCount];
        const newData = { ...row.data };

        unifiedColumns.forEach((key, colIndex) => {
          const v = src[colIndex] ?? "";
          newData[key] = v;
        });

        next[rowIndex] = { ...row, data: newData };
      }
      return next;
    });

    // DB 반영
    for (let offset = 0; offset < targetCount; offset++) {
      const row = slice[offset];
      if (!row) continue;

      const src = parsed[offset % sourceCount];
      for (let colIndex = 0; colIndex < unifiedColumns.length; colIndex++) {
        const key = unifiedColumns[colIndex];
        const v = src[colIndex] ?? "";
        await syncPatch(row.id, key, v);
      }
    }

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
                (rowSelected ? " bg-blue-50" : "");

              return (
                <tr key={row.id}>
                  <td
                    className={headerCellBase}
                    data-row-header="1"
                    data-row-index={rowIndex}
                    onMouseDown={(e) => handleRowHeaderMouseDown(rowIndex, e)}
                    onMouseEnter={() => handleRowHeaderMouseEnter(rowIndex)}
                    onContextMenu={(e) => handleRowHeaderContextMenu(rowIndex, e)}
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