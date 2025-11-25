"use client";

export async function checkConflict(rowId: number, localSnapshot: any) {
  const res = await fetch(`/api/unified/${rowId}`, { cache: "no-store" });
  const server = await res.json();

  // 서버 최신 데이터와 내가 본 스냅샷이 서로 다르면 → 충돌 발생
  if (JSON.stringify(server.data) !== JSON.stringify(localSnapshot)) {
    return false; // 충돌
  }

  return true; // 충돌 없음
}
