"use client";

import { useEffect, useState } from "react";
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
  const [loading, setLoading] = useState(true);

  // 소켓 연결
  useEffect(() => {
    if (!socket) {
      // 1. 소켓 객체 생성 (아직 연결 시도 전)
      socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
        transports: ["websocket"],
        reconnection: true,
      });
    }

    // 2. [수정된 부분]: 'connect' 이벤트 리스너를 추가하여 연결 성공 후 작업 수행
    // 기존의 `socket.emit("join", "global");` 코드를 이 안으로 이동했습니다.
    socket.on('connect', () => {
        console.log("Socket connected, joining global room.");
        socket.emit("join", "global");
    });

    socket.on("unified:update", () => {
      loadData();
    });

    // 소켓 연결 오류 발생 시 디버깅을 위한 리스너 추가
    socket.on('connect_error', (err: any) => {
        console.error("Socket connection error:", err.message);
    });

    return () => {
        // 컴포넌트 언마운트 시 소켓 연결 해제 (선택 사항이지만 안전함)
        // socket.disconnect(); 
    };
  }, []);

  // DB 데이터 불러오기
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

    // 소켓이 연결된 경우에만 emit
    if (socket && socket.connected) {
        socket.emit("unified:update");
    } else {
        console.warn("Socket is not connected. Cannot emit update.");
    }
  }

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


