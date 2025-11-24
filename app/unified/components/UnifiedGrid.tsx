"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";

type UnifiedRow = {
  id: number;
  data: Record<string, any>;
};

// 🔵 전역 socket
let socket: any = null;

// 🔵 모든 컬럼
const unifiedColumns: string[] = [
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
  "5차연장"
];

export default function UnifiedGrid() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!socket) {
      socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
        transports: ["websocket"],
      });
    }

    socket.emit("join", "global");
    socket.on("unified:update", loadData);

    return () => {};
  }, []);

  async function loadData() {
    setLoading(true);
    const res = await fetch("/api/unified", { cache: "no-store" });
    const data = await res.json();
    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function saveCell(id: number, key: string, value: string) {
    await fetch(`/api/unified/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ [key]: value }),
    });

    if (socket) socket.emit("unified:update");
  }

  async function addRow() {
    const initialData: Record<string, string> = {};
    unifiedColumns.forEach((c) => (initialData[c] = ""));

    const res = await fetch("/api/unified", {
      method: "POST",
      body: JSON.stringify(initialData),
    });

    if (socket) socket.emit("unified:update");
  }

  async function add10Rows() {
    for (let i = 0; i < 10; i++) {
      await addRow();
    }
  }

  if (loading)
    return <div className="text-center text-gray-500 py-10">Loading...</div>;

  return (
    <div className="px-4">

      {/* 버튼 원래 위치로 복구 */}
      <div className="flex gap-2 mb-2">
        <button onClick={addRow} className="px-3 py-1 border text-xs bg-white">
          행 추가
        </button>

        <button onClick={add10Rows} className="px-3 py-1 border text-xs bg-white">
          행 10 추가
        </button>
      </div>

      <div
        className="border rounded bg-white overflow-auto w-full"
        style={{ height: "calc(100vh - 210px)" }}
      >
        <table className="min-w-[2800px] table-fixed border-collapse text-xs">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th className="border px-2 py-1 w-10">ID</th>
              {unifiedColumns.map((col) => (
                <th key={col} className="border px-2 py-1">
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="border px-2 py-1">{row.id}</td>

                {unifiedColumns.map((key) => (
                  <td key={key} className="border px-2 py-1">
                    <input
                      className="w-full text-xs"
                      defaultValue={row.data[key] || ""}
                      onBlur={(e) => saveCell(row.id, key, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


