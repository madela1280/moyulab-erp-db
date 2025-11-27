"use client";

import { useEffect, useState, useRef } from "react";
import socket from "@/app/global-socket/socket-client.js";

type UnifiedRow = { id: number; data: Record<string, any> };

export default function UnifiedGrid() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const busy = useRef(false);

  // 최초 로딩
  async function load() {
    const r = await fetch("/api/unified", { cache: "no-store" });
    setRows(await r.json());
  }

  useEffect(() => {
    load();
  }, []);

  // 소켓 reload
  useEffect(() => {
    if (!socket) return;

    const handler = () => {
      if (busy.current) return;
      reload();
    };

    socket.on("unified:update", handler);
    return () => socket.off("unified:update", handler);
  }, []);

  // 강력 안정형 reload
  async function reload() {
    busy.current = true;

    const r = await fetch("/api/unified", { cache: "no-store" });
    setRows(await r.json());

    setTimeout(() => (busy.current = false), 50);
  }

  // 저장
  async function saveCell(id: number, key: string, value: string) {
    const payload = value === "" ? { [key]: null } : { [key]: value };

    await fetch(`/api/unified/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });

    // DB 반영 후 소켓 이벤트
    socket?.emit("unified:update");
  }

  return (
    <div>
      {!rows.length ? (
        <div className="p-5 text-gray-600">Loading...</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th>ID</th>
              {Object.keys(rows[0].data).map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>

                {Object.keys(row.data).map((key) => (
                  <td key={key}>
                    <input
                      defaultValue={row.data[key] ?? ""}
                      onBlur={(e) => saveCell(row.id, key, e.target.value)}
                      className="w-full"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}








