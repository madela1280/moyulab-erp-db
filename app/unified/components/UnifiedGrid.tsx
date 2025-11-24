"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";

export default function UnifiedGrid() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      transports: ["websocket"],
    });

    socket.emit("join", "global");

    socket.on("unified:update", () => {
      loadData();
    });

    return () => socket.disconnect();
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
    const body = { [key]: value };

    await fetch(`/api/unified/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      transports: ["websocket"],
    });
    socket.emit("unified:update");
  }

  async function addRow() {
    const res = await fetch("/api/unified", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const newRow = await res.json();
    setRows((prev) => [...prev, newRow]);

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      transports: ["websocket"],
    });
    socket.emit("unified:update");
  }

  async function deleteRow(id: number) {
    await fetch(`/api/unified/${id}`, {
      method: "DELETE",
    });

    setRows((prev) => prev.filter((r) => r.id !== id));

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      transports: ["websocket"],
    });
    socket.emit("unified:update");
  }

  if (loading)
    return (
      <div className="text-center text-gray-500 py-10">Loading...</div>
    );

  return (
    <div className="px-2">
      <div className="flex gap-2 mb-2">
        <button
          onClick={addRow}
          className="px-2 py-1 border text-xs bg-white"
        >
          행 추가
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
              <th className="border px-2 py-1">거래처분류</th>
              <th className="border px-2 py-1">상태</th>
              <th className="border px-2 py-1">안내분류</th>
              <th className="border px-2 py-1">구매/렌탈</th>
              <th className="border px-2 py-1">기기번호</th>
              <th className="border px-2 py-1">기종</th>
              <th className="border px-2 py-1">삭제</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="border px-2 py-1">{row.id}</td>

                {Object.keys(row.data).map((key) => (
                  <td key={key} className="border px-2 py-1">
                    <input
                      className="w-full text-xs"
                      defaultValue={row.data[key]}
                      onBlur={(e) =>
                        saveCell(row.id, key, e.target.value)
                      }
                    />
                  </td>
                ))}

                <td className="border px-2 py-1 text-center">
                  <button
                    onClick={() => deleteRow(row.id)}
                    className="text-red-500 text-xs"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
