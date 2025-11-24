// app/unified/components/UnifiedGrid.tsx
"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { unifiedColumns } from "@/app/config/unifiedColumns";

type UnifiedRow = {
  id: number;
  data: Record<string, any>;
};

// ✅ 전역 socket (수정 핵심)
let socket: any = null;

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
    socket.on("unified:update", () => loadData());

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
    const body = { [key]: value };

    await fetch(`/api/unified/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
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

    const newRow = (await res.json()) as UnifiedRow;

    setRows((prev: UnifiedRow[]) => [...prev, newRow]);

    if (socket) socket.emit("unified:update");
  }

  async function add10Rows() {
    for (let i = 0; i < 10; i++) {
      await addRow();
    }
  }

  async function deleteRow(id: number) {
    await fetch(`/api/unified/${id}`, { method: "DELETE" });

    setRows((prev: UnifiedRow[]) => prev.filter((r) => r.id !== id));

    if (socket) socket.emit("unified:update");
  }

  if (loading)
    return <div className="text-center text-gray-500 py-10">Loading...</div>;

  return (
    <div className="px-4">
      <div className="flex gap-2 mb-2">
        <button
          onClick={addRow}
          className="px-3 py-1 border text-xs bg-white"
        >
          행 추가
        </button>

        <button
          onClick={add10Rows}
          className="px-3 py-1 border text-xs bg-white"
        >
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
              <th className="border px-2 py-1 w-12">삭제</th>
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

