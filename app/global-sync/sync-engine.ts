"use client";

// @ts-ignore
import socket from "@/global-socket/socket-client.js";

// @ts-ignore
const socketAny: any = socket;

export async function syncPatch(id: number, key: string, value: any) {
  const payload = value === "" ? { [key]: null } : { [key]: value };

  await fetch(`/api/unified/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  setTimeout(() => {
    // @ts-ignore
    socketAny?.emit("unified:update");
  }, 120);
}

export function syncListen(handler: () => void) {
  if (!socketAny) return;

  socketAny.on("unified:update", handler);
  return () => socketAny.off("unified:update", handler);
}



