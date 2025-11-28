"use client";

import socket from "@/global-socket/socket-client.js";

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

export function syncListen(reload: Function) {
  if (!socket) return;

  socket.on("unified:update", reload);

  return () => {
    socket.off("unified:update", reload);
  };
}
