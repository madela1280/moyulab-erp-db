"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { acquireLock, releaseLock } from "@/global-lock/lock-engine";
import {
  bulkDeleteSymphony,
  bulkPatchSymphony,
  insertSymphonyRows,
  patchSymphonyRow,
  type SymphonyRow,
} from "@/devices/symphony/service/serviceSymphony";
import { symphonyColumns } from "@/devices/symphony/columns/symphonyColumns";
import { useSymphonyRows } from "@/devices/symphony/hooks/useSymphonyRows";

type Props = {
  isColumnEditMode?: boolean;

  columnOrder?: string[];
  onColumnOrderChange?: (next: string[]) => void;

  colWidthUnitByKey?: Record<string, number>;
  onColWidthUnitByKeyChange?: (next: Record<string, number>) => void;
};

export default function SymphonyGrid(props: Props) {
  const { rows, setRows, baseIndex, loading, error, reload, setTotalCount } = useSymphonyRows();

  const isColumnEditMode = !!props.isColumnEditMode;

  const [columnOrderState, setColumnOrderState] = useState<string[]>(() => [...symphonyColumns]);
  const [colWidthUnitByKeyState, setColWidthUnitByKeyState] = useState<Record<string, number>>({});

  const columnOrder = props.columnOrder ?? columnOrderState;
  const colWidthUnitByKey = props.colWidthUnitByKey ?? colWidthUnitByKeyState;

  function setColumnOrderNext(updater: (prev: string[]) => string[]) {
    if (props.onColumnOrderChange) props.onColumnOrderChange(updater(columnOrder));
    else setColumnOrderState(updater);
  }
  function setColWidthUnitByKeyNext(
    updater: (prev: Record<string, number>) => Record<string, number>
  ) {
    if (props.onColWidthUnitByKeyChange) props.onColWidthUnitByKeyChange(updater(colWidthUnitByKey));
    else setColWidthUnitByKeyState(updater);
  }

  const viewColumns = useMemo(() => columnOrder, [columnOrder]);

  function getWidthPx(key: string) {
    const unit = colWidthUnitByKey?.[key] ?? 20;
    const BASE = 140;
    const MIN = 60;
    const MAX = 520;
    const px = Math.round((BASE * unit) / 20);
    return Math.max(MIN, Math.min(MAX, px));
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
    const safe = Number.isFinite(unit) ? Math.max(1, Math.min(200, Math.floor(unit))) : 20;
    setColWidthUnitByKeyNext((prev) => ({ ...prev, [key]: safe }));
  }

  // ===== 선택 상태 =====
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

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuMode, setContextMenuMode] = useState<"row" | "cell">("row");

  function isRowSelected(rowIndex: number) {
    if (!selectedRowRange) return false;
    return rowIndex >= selectedRowRange.start && rowIndex <= selectedRowRange.end;
  }

  function setCellRangeByPoints(r1: number, c1: number, r2: number, c2: number) {
    const startRow = Math.max(0, Math.min(r1, r2));
    const endRow = Math.min(rows.length - 1, Math.max(r1, r2));
    const startCol = Math.max(0, Math.min(c1, c2));
    const endCol = Math.min(viewColumns.length - 1, Math.max(c1, c2));
    setSelectedCellRange({ startRow, endRow, startCol, endCol });
  }

  function isCellSelected(rowIndex: number, colIndex: number) {
    if (!selectedCellRange) return false;
    const { startRow, endRow, startCol, endCol } = selectedCellRange;
    return rowIndex >= startRow && rowIndex <= endRow && colIndex >= startCol && colIndex <= endCol;
  }

  // ===== 편집(락) =====
  const [myRowLocks, setMyRowLocks] = useState<Record<number, boolean>>({});
  const editingCellRef = useRef<{ rowId: number; key: string } | null>(null);

  const [activeEditCell, setActiveEditCell] = useState<{ rowId: number; key: string } | null>(null);
  const [activeEditValue, setActiveEditValue] = useState<string>("");

  async function handleFocus(rowId: number, key: string, initialValue: string, e: any) {
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

  // ===== 키보드 이동 =====
  function focusCell(rowIndex: number, colIndex: number) {
    const el = document.querySelector<HTMLInputElement>(
      `input[data-row="${rowIndex}"][data-col="${colIndex}"]`
    );
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
    let r = rowIndex;
    let c = colIndex;

    switch (e.key) {
      case "ArrowDown":
        if (rowIndex < rows.length - 1) r = rowIndex + 1;
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

    if (focusCell(r, c)) e.preventDefault();
  }

  // ===== 컨텍스트 메뉴 동작 =====
  function getSelectedRowSlice() {
    if (!selectedRowRange) return { start: 0, end: -1, slice: [] as SymphonyRow[] };
    const start = Math.max(0, selectedRowRange.start);
    const end = Math.min(rows.length - 1, selectedRowRange.end);
    return { start, end, slice: rows.slice(start, end + 1) };
  }

  async function handleClear() {
    if (selectedCellRange) {
      const { startRow, endRow, startCol, endCol } = selectedCellRange;
      const updates: Array<{ id: number; patch: Record<string, any> }> = [];

      const next = [...rows];
      for (let r = startRow; r <= endRow; r++) {
        const row = next[r];
        if (!row) continue;

        const patch: Record<string, any> = {};
        const newData: Record<string, any> = { ...row.data };

        for (let c = startCol; c <= endCol; c++) {
          const k = viewColumns[c];
          if (!k) continue;
          newData[k] = "";
          patch[k] = null; // 빈값은 null로 저장
        }

        next[r] = { ...row, data: newData };
        updates.push({ id: row.id, patch });
      }

      setRows(next);
      await bulkPatchSymphony({ updates });
      setContextMenu(null);
      return;
    }

    const { slice } = getSelectedRowSlice();
    if (!slice.length) return;

    const updates = slice.map((row) => {
      const patch: Record<string, any> = {};
      for (const k of viewColumns) patch[k] = null;
      return { id: row.id, patch };
    });

    setRows((prev) =>
      prev.map((r) =>
        slice.some((x) => x.id === r.id)
          ? { ...r, data: Object.fromEntries(viewColumns.map((k) => [k, ""])) }
          : r
      )
    );

    await bulkPatchSymphony({ updates });
    setContextMenu(null);
  }

  async function handleCopy() {
    if (selectedCellRange) {
      const { startRow, endRow, startCol, endCol } = selectedCellRange;
      const lines: string[] = [];
      for (let r = startRow; r <= endRow; r++) {
        const row = rows[r];
        if (!row) continue;
        const cells: string[] = [];
        for (let c = startCol; c <= endCol; c++) {
          const k = viewColumns[c];
          cells.push(String(row.data?.[k] ?? ""));
        }
        lines.push(cells.join("\t"));
      }
      await navigator.clipboard.writeText(lines.join("\n"));
      setContextMenu(null);
      return;
    }

    const { slice } = getSelectedRowSlice();
    if (!slice.length) return;

    const text = slice.map((r) => viewColumns.map((k) => String(r.data?.[k] ?? "")).join("\t")).join("\n");
    await navigator.clipboard.writeText(text);
    setContextMenu(null);
  }

  async function handlePasteFromClipboard() {
    const text = await navigator.clipboard.readText().catch(() => "");
    if (!text) return;

    const baseRow = selectedCellRange ? selectedCellRange.startRow : Math.max(0, selectedRowRange?.start ?? 0);
    const baseCol = selectedCellRange ? selectedCellRange.startCol : 0;

    const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
    const parsed = lines.map((l) => l.split("\t"));

    const next = [...rows];
    const updates: Array<{ id: number; patch: Record<string, any> }> = [];

    for (let ro = 0; ro < parsed.length; ro++) {
      const rIndex = baseRow + ro;
      const row = next[rIndex];
      if (!row) break;

      const patch: Record<string, any> = {};
      const newData: Record<string, any> = { ...row.data };

      for (let co = 0; co < parsed[ro].length; co++) {
        const cIndex = baseCol + co;
        if (cIndex >= viewColumns.length) break;
        const k = viewColumns[cIndex];
        const v = parsed[ro][co] ?? "";
        newData[k] = v;
        patch[k] = v === "" ? null : v;
      }

      next[rIndex] = { ...row, data: newData };
      updates.push({ id: row.id, patch });
    }

    setRows(next);
    if (updates.length) await bulkPatchSymphony({ updates });
    setContextMenu(null);
  }

  async function handleInsertRows() {
    const anchor = selectedRowRange?.start ?? 0;
    const beforeId = anchor > 0 ? rows[anchor - 1]?.id ?? null : null;
    const afterId = rows[anchor]?.id ?? null;

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

    // 로컬 반영(빠른 체감) + totalCount 감소
    const idSet = new Set(ids);
    setRows((prev) => prev.filter((r) => !idSet.has(r.id)));
    setTotalCount((t) => Math.max(0, t - ids.length));

    setSelectedRowRange(null);
    setContextMenu(null);
  }

  // ===== 전역 이벤트 =====
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
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setContextMenu(null);

      if (e.key === "Delete" && (selectedCellRange || selectedRowRange)) {
        e.preventDefault();
        void handleClear();
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const k = (e.key || "").toLowerCase();
      if (k === "c" && (selectedCellRange || selectedRowRange)) {
        e.preventDefault();
        void handleCopy();
      }
      if (k === "v" && (selectedCellRange || selectedRowRange)) {
        // keydown에서 막으면 paste가 취소될 수 있어 readText 방식으로 처리
        e.preventDefault();
        void handlePasteFromClipboard();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCellRange, selectedRowRange, rows, viewColumns]);

  if (loading) return <div className="text-center text-gray-500 py-10">Loading...</div>;
  if (error) return <div className="text-center text-red-600 py-10">{error}</div>;

  return (
    <div
      className="w-full h-full flex flex-col"
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const t = e.target as HTMLElement;
        if (t.closest("table")) return;
        if (t.closest('[data-context-menu="1"]')) return;
        setSelectedRowRange(null);
        setSelectedCellRange(null);
        setContextMenu(null);
      }}
    >
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
                    <div className="w-full text-center text-[11px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {c}
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
            {rows.map((row, rowIndex) => {
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
                    }}
                  >
                    {baseIndex + rowIndex}
                  </td>

                  {viewColumns.map((key, colIndex) => {
                    const cellSelected = isCellSelected(rowIndex, colIndex);
                    const cls =
                      "border px-2 py-[3px] " +
                      (cellSelected ? "bg-blue-200" : rowSelected ? "bg-blue-50" : "bg-white");

                    return (
                      <td
                        key={key}
                        className={cls}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          setIsCellDragging(true);
                          setCellDragAnchor({ row: rowIndex, col: colIndex });
                          setCellRangeByPoints(rowIndex, colIndex, rowIndex, colIndex);
                          setSelectedRowRange(null);
                          setContextMenu(null);
                        }}
                        onMouseEnter={() => {
                          if (!isCellDragging || !cellDragAnchor) return;
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
                        }}
                      >
                        <input
                          className="w-full bg-transparent outline-none text-slate-900"
                          value={
                            activeEditCell?.rowId === row.id && activeEditCell?.key === key
                              ? activeEditValue
                              : String(row.data?.[key] ?? "")
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
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={handleClear}>
                내용 지우기
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={handleCopy}>
                복사(클립보드)
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={handlePasteFromClipboard}>
                붙여넣기(클립보드)
              </button>
            </>
          ) : (
            <>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={handleClear}>
                내용 지우기
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={handleCopy}>
                복사(클립보드)
              </button>
              <button className="block w-full text-left px-3 py-1 hover:bg-gray-100" onClick={handlePasteFromClipboard}>
                붙여넣기(클립보드)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}