"use client";

// @ts-ignore
import socket from "@/global-socket/socket-client.js";

// 항상 최신 소켓을 가져오는 안전한 getter
function getSocket() {
  if (typeof window === "undefined") return null;

  // socket-client.js 에서 window.__MOYULAB_SOCKET__에 저장한 소켓을 항상 읽는다
  return window.__MOYULAB_SOCKET__ || null;
}

/* ------------------------------ PATCH ------------------------------ */
export async function syncPatch(id: number, key: string, value: any) {
  const payload = value === "" ? { [key]: null } : { [key]: value };

  // DB 저장
  await fetch(`/api/unified/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  // 최신 소켓 확보 후 emit
  const s = getSocket();
  if (s) {
    setTimeout(() => {
      try {
        s.emit("unified:update");
      } catch (err) {
        console.warn("socket emit error (ignored):", err);
      }
    }, 120);
  }
}

/* ------------------------------ LISTEN ------------------------------ */
export function syncListen(handler: () => void) {
  const s = getSocket();
  if (!s) return;

  try {
    s.on("unified:update", handler);
  } catch (err) {
    console.warn("socket on error (ignored):", err);
  }

  // 클린업
  return () => {
    try {
      s.off("unified:update", handler);
    } catch (err) {
      console.warn("socket cleanup error (ignored):", err);
    }
  };
}




