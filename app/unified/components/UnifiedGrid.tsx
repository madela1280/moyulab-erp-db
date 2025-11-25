"use client";

import { useEffect, useState, useRef } from "react";
import { getSocket } from "@/core/sync/socketClient";

type UnifiedRow = {
  id: number;
  data: Record<string, any>;
};

// 컬럼 정의
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
  "5차연장",
];

export default function UnifiedGrid() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [snapshot, setSnapshot] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const silentRef = useRef(false);

  // -------------------------------------------------------------------------
  // 소켓 연결
  // -------------------------------------------------------------------------
  useEffect(() => {
    const socket = getSocket();

    socket.on("unified:update", async () => {
      await silentReload();
    });

    return () => {};
  }, []);

  // -------------------------------------------------------------------------
  // 데이터 로딩 + 스냅샷 저장
  // -------------------------------------------------------------------------
  async function loadData() {
    setLoading(true);
    const res = await fetch("/api/unified", { cache: "no-store" });
    const data = await res.json();
    setRows(data);
    setSnapshot(data);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // -------------------------------------------------------------------------
  // 부분 reload (소켓 업데이트)
  // -------------------------------------------------------------------------
  async function silentReload() {
    if (silentRef.current) return;
    silentRef.current = true;

    const res = await fetch("/api/unified", { cache: "no-store" });
    const fresh = await res.json();

    setRows((prev) => {
      const map: Record<number, UnifiedRow> = {};
      prev.forEach((r) => (map[r.id] = r));

      fresh.forEach((fr: UnifiedRow) => {
        const old = map[fr.id];
        if (!old) {
          map[fr.id] = fr;
        } else if (JSON.stringify(old.data) !== JSON.stringify(fr.data)) {
          map[fr.id] = fr;
        }
      });

      return Object.values(map);
    });

    setSnapshot(fresh);
    silentRef.current = false;
  }

  // -------------------------------------------------------------------------
  // 저장 + 충돌방지
  // -------------------------------------------------------------------------
  async function saveCell(id: number, key: string, value: string) {
    const local = snapshot.find((r) => r.id === id);
    if (!local) return;

    // 서버 최신 데이터 확인
    const res = await fetch(`/api/unified/${id}`, { cache: "no-store" });
    const server = await res.json();

    // 충돌 여부
    if (JSON.stringify(server.data) !== JSON.stringify(local.data)) {
      alert("⚠️ 다른 사용자가 먼저 수정했습니다.\n새로고침 후 다시 시도하세요.");
      await silentReload();
      return;
    }

    // 저장
    const body = { [key]: value };

    await fetch(`/api/unified/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    // 소켓 브로드캐스트
    const socket = getSocket();
    socket.emit("unified:update");
  }

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------
  if (loading)
    return <div className="text-center text-gray-500 py-10">Loading...</div>;

  return (
    <div className="px-2">
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


