"use client";

import { useEffect, useState, useRef } from "react";
import { getSocket } from "@/core/sync/socketClient";

type UnifiedRow = {
  id: number;
  data: Record<string, any>;
};

const unifiedColumns: string[] = [
  "거래처분류","상태","안내분류","구매/렌탈","기기번호","기종","에러횟수",
  "제품","수취인명","연락처1","연락처2","계약자주소","택배발송일","시작일",
  "종료일","반납요청일","반납완료일","특이사항1","특이사항2","총연장횟수",
  "신청일","0차연장","1차연장","2차연장","3차연장","4차연장","5차연장"
];

export default function UnifiedGrid() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [snapshot, setSnapshot] = useState<UnifiedRow[]>([]);
  const [snapBeforeEdit, setSnapBeforeEdit] = useState<Record<number, any>>({});
  const loadingRef = useRef(false);

  async function load() {
    const r = await fetch("/api/unified", { cache: "no-store" });
    const d = await r.json();
    setRows(d);
    setSnapshot(d);
  }

  async function silentReload() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    const r = await fetch("/api/unified", { cache: "no-store" });
    const fresh = await r.json();

    setRows(fresh);
    setSnapshot(fresh);

    loadingRef.current = false;
  }

  useEffect(() => {
    load();
    const s = getSocket();
    s.onmessage = () => silentReload();
  }, []);

  // -------------------------------------------------------
  // 충돌방지 로직
  // -------------------------------------------------------

  // 1) 셀 클릭 시 서버 최신 데이터를 row 단위로 저장
  async function recordSnapshotBeforeEdit(id: number) {
    const r = await fetch(`/api/unified/${id}`, { cache: "no-store" });
    const server = await r.json();

    setSnapBeforeEdit((prev) => ({
      ...prev,
      [id]: JSON.parse(JSON.stringify(server.data))
    }));
  }

  // 2) 저장 직전 비교는 snapBeforeEdit vs 현재 서버 최신 상태
  async function saveCell(id: number, key: string, value: string) {
    const before = snapBeforeEdit[id];
    if (!before) return;

    const r = await fetch(`/api/unified/${id}`, { cache: "no-store" });
    const server = await r.json();

    // 충돌 기준:
    // before(편집 시작시 서버 상태) !== server(저장 직전 서버 상태)
    // → 다른 사용자가 수정한 것
    if (JSON.stringify(before) !== JSON.stringify(server.data)) {
      alert("⚠️ 다른 사용자가 거의 동시에 수정했습니다.\n새로고침 후 다시 시도하세요.");
      await silentReload();
      return;
    }

    // 저장 (기존 방식 유지)
    await fetch(`/api/unified/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ [key]: value }),
    });

    // 실시간 동기화 신호 전파
    getSocket().emit("unified:update");
  }

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
                      onFocus={() => recordSnapshotBeforeEdit(row.id)}
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




