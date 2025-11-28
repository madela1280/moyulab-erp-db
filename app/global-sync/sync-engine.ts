"use client";

// @ts-ignore
import socket from "@/global-socket/socket-client.js";

// 셀 PATCH + 소켓 emit
export async function syncPatch(id: number, key: string, value: any) {
  const payload = value === "" ? { [key]: null } : { [key]: value };

  await fetch(`/api/unified/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  setTimeout(() => {
    socket?.emit("unified:update");
  }, 120);
}

// 소켓 구독
export function syncListen(handler: () => void) {
  if (!socket) return;

  socket.on("unified:update", handler);
  return () => socket.off("unified:update", handler);
}



