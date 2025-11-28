"use client";

// @ts-ignore
import socket from "@/global-socket/socket-client.js";

export async function syncPatch(id: number, key: string, value: any) {
  const payload = value === "" ? { [key]: null } : { [key]: value };

  await fetch(`/api/unified/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  setTimeout(() => {
    // @ts-ignore
    socket?.emit("unified:update");
  }, 120);
}

export function syncListen(reload: Function) {
  // @ts-ignore
  if (!socket) return;
  // @ts-ignore
  socket.on("unified:update", reload);
  return () => {
    // @ts-ignore
    socket.off("unified:update", reload);
  };
}


