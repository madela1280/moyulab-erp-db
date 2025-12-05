"use client";

// @ts-ignore
import socket from "@/global-socket/socket-client.js";

// 항상 최신 소켓을 가져오는 안전한 getter
function getSocket() {
  if (typeof window === "undefined") return null;
  // socket-client.js 에서 window.__MOYULAB_SOCKET__에 저장한 소켓을 항상 읽는다
  // (global.d.ts 에서 타입 선언 이미 되어 있음)
  // @ts-ignore
  return window.__MOYULAB_SOCKET__ || null;
}

/**
 * 소켓이 아직 준비되지 않았다면, 준비될 때까지 짧게 반복해서 기다렸다가
 * 준비되면 콜백을 한 번만 호출해 주는 헬퍼.
 */
function waitForSocket(callback: (s: any) => void) {
  if (typeof window === "undefined") return () => {};

  let cancelled = false;
  let s = getSocket();

  if (s) {
    callback(s);
    return () => {};
  }

  const timer = setInterval(() => {
    if (cancelled) {
      clearInterval(timer);
      return;
    }

    s = getSocket();
    if (s) {
      clearInterval(timer);
      callback(s);
    }
  }, 100); // 0.1초 간격으로 짧게만 확인

  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

/* ------------------------------ PATCH ------------------------------ */
export async function syncPatch(id: number, key: string, value: any) {
  // 빈 문자열은 null 로 저장해서 "지우기" 기능을 구현
  const payload = value === "" ? { [key]: null } : { [key]: value };

  // DB 저장
  await fetch(`/api/unified/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  // 소켓이 이미 있으면 바로, 아직이면 준비될 때까지 기다렸다가 emit
  waitForSocket((s) => {
    setTimeout(() => {
      try {
        s.emit("unified:update");
      } catch (err) {
        console.warn("socket emit error (ignored):", err);
      }
    }, 120);
  });
}

/* ------------------------------ DELETE (row) ------------------------------ */
export async function syncDeleteRow(id: number) {
  await fetch(`/api/unified/${id}`, {
    method: "DELETE",
  });

  waitForSocket((s) => {
    setTimeout(() => {
      try {
        s.emit("unified:update");
      } catch (err) {
        console.warn("socket emit error (ignored):", err);
      }
    }, 120);
  });
}

/* ------------------------------ LISTEN ------------------------------ */
export function syncListen(handler: () => void) {
  let currentSocket: any = null;
  let stopWaiting: (() => void) | null = null;

  function attach(s: any) {
    currentSocket = s;
    try {
      s.on("unified:update", handler);
    } catch (err) {
      console.warn("socket on error (ignored):", err);
    }
  }

  // 소켓이 이미 준비되어 있으면 바로 붙이고,
  // 아직이면 준비될 때까지 waitForSocket 으로 기다렸다가 한 번만 붙인다.
  const s = getSocket();
  if (s) {
    attach(s);
  } else {
    stopWaiting = waitForSocket(attach);
  }

  // 클린업
  return () => {
    if (stopWaiting) {
      stopWaiting();
    }
    if (currentSocket) {
      try {
        currentSocket.off("unified:update", handler);
      } catch (err) {
        console.warn("socket cleanup error (ignored):", err);
      }
    }
  };
}