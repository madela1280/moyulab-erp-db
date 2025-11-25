"use client";

import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

type UnifiedRow = {
  id: number;
  data: Record<string, any>;
};

// 전역 socket
let socket: any = null;

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
  const loadingRef = useRef(false);

  // -------------------------------------------------------------------------
  // 소켓 연결 (절대 변경 금지 부분 그대로 유지)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!socket) {
      socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
        transports: ["websocket"],
        reconnection: true,
      });
    }

    socket.on("connect", () => {
      socket.emit("join", "global");
    });

    socket.on("unified:update", async () => {
      await silentReload();
    });

    return () => {};
  }, []);

  // -------------------------------------------------------------------------
  // 초기 로딩 + snapshot 저장
  // -------------------------------------------------------------------------
  async function loadData() {
    setLoading(true);
    const res = await fetch("/api/unified", { cache: "no-store" });
    const data = await res.json();

    setRows(data);
    setSnapshot(data);
    setLoading(false);
  }

  // 소켓 갱신 시 "깜빡임 없는 부분 업데이트"
  async function silentReload() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const res = await fetch("/api/unified", { cache: "no-store" });
    const fresh = await res.json();

    setRows((prev) => {
      const map: Record<number, UnifiedRow> = {};
      prev.forEach((r) => (map[r.id] = r));

      // 변경된 row만 교체 → 깜빡임 제거
      fresh.forEach((fr: UnifiedRow) => {
        const old = map[fr.id];
        if (!old) {
          map[fr.id] = fr;
        } else if (JSON.stringify(old.data) !== JSON.stringify(fr.data)) {
          map[fr.id] = fr; // 변경된 row만 교체
        }
      });

      return Object.values(map);
    });

    setSnapshot(fresh);
    loadingRef.current = false;
  }

  useEffect(() => {
    loadData();
  }, []);

  // -------------------------------------------------------------------------
  // 셀 저장 + 충돌 방지 (UI에서만 처리)
  // -------------------------------------------------------------------------
  async function saveCell(id: number, key: string, value: string) {
    const localRow = snapshot.find((r) => r.id === id);
    if (!localRow) return;

    // 서버 최신 데이터 확인
    const res = await fetch(`/api/unified/${id}`, { cache: "no-store" });
    const server = await res.json();

    // 충돌 감지
    if (JSON.stringify(server.data) !== JSON.stringify(localRow.data)) {
      alert("⚠️ 다른 사용자가 먼저 수정했습니다.\n새로고침 후 다시 시도하세요.");
      await silentReload();
      return;
    }

    // 충돌이 없으면 저장
    const body = { [key]: value };
    await fetch(`/api/unified/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    if (socket && socket.connected) {
      socket.emit("unified:update");
    }
  }

  // -------------------------------------------------------------------------
  // UI 그대로 유지
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
            {rows.map((row: UnifiedRow) => (
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


