"use client";

import { useEffect, useState } from "react";
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

  /* --------------------- UI --------------------- */
  if (!rows.length)
    return <div className="text-center text-gray-500 py-10">Loading...</div>;

  return (
    // 브라우저 기본 우클릭 메뉴 막기
    <div
      className="w-full h-full flex flex-col"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="border-t border-x bg-white w-full flex-1 overflow-auto">
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
                    onMouseDown={(e) => handleRowHeaderMouseDown(rowIndex, e)}
                    onMouseEnter={() => handleRowHeaderMouseEnter(rowIndex)}
                  >
                    {rowIndex + 1}
                  </td>

                  {unifiedColumns.map((key) => (
                    <td key={key} className={dataCellBase}>
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
    </div>
  );
}