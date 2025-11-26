"use client";

import { useEffect, useState, useRef } from "react";
import socket from "../../../moyulab-socket/socket-client.js";

type UnifiedRow = { id: number; data: Record<string, any> };

const unifiedColumns = [
  "거래처분류","상태","안내분류","구매/렌탈","기기번호","기종","에러횟수","제품",
  "수취인명","연락처1","연락처2","계약자주소","택배발송일","시작일","종료일",
  "반납요청일","반납완료일","특이사항1","특이사항2","총연장횟수","신청일",
  "0차연장","1차연장","2차연장","3차연장","4차연장","5차연장"
];

export default function UnifiedGrid() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const snapshot = useRef<UnifiedRow[]>([]);
  const lock = useRef(false);

  /* --------------------- 소켓 연결 --------------------- */
  useEffect(() => {
    const handler = () => fastReload();

    socket.on("unified:update", handler);
    return () => {
      socket.off("unified:update", handler);
    };
  }, []);

  /* --------------------- 최초 로딩 --------------------- */
  async function load() {
    const r = await fetch("/api/unified", { cache: "no-store" });
    const data = await r.json();
    setRows(data);
    snapshot.current = data;
  }

  useEffect(() => {
    load();
  }, []);

  /* --------------------- 초고속 전체 동기화 --------------------- */
  async function fastReload() {
    if (lock.current) return;
    lock.current = true;

    const r = await fetch("/api/unified", { cache: "no-store" });
    const fresh = await r.json();

    setRows(fresh);
    snapshot.current = fresh;

    lock.current = false;
  }

  /* --------------------- 셀 저장 --------------------- */
  async function saveCell(id: number, key: string, value: string) {
    const local = snapshot.current.find((r) => r.id === id);
    if (!local) return;

    const r = await fetch(`/api/unified/${id}`, { cache: "no-store" });
    const server = await r.json();

    if (!server || server.error) {
  await fastReload();
  return;
}

// 🔥 삭제(빈 문자열)도 변경으로 인식하도록 강제 비교
const latest = { ...local.data, [key]: value };

await fetch(`/api/unified/${id}`, {
  method: "PATCH",
  body: JSON.stringify({ [key]: value === "" ? null : value }),
});

// 🔥 업데이트 브로드캐스트
socket.emit("unified:update");

    socket.emit("unified:update");
  }

  if (!rows.length)
    return <div className="text-center text-gray-500 py-10">Loading...</div>;

  return (
    <div className="px-2">
      <div className="border rounded bg-white overflow-auto w-full"
           style={{ height: "calc(100vh - 210px)" }}>
        <table className="min-w-[2800px] table-fixed border-collapse text-xs">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th className="border px-2 py-1 w-10">ID</th>
              {unifiedColumns.map((c) => (
                <th key={c} className="border px-2 py-1">{c}</th>
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





