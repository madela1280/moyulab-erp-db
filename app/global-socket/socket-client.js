"use client";
// @ts-nocheck

import { io } from "socket.io-client";

let socket = null;

if (typeof window !== "undefined") {
  if (!window.__MOYULAB_SOCKET__) {
    const s = io("https://moulab.kr", {
      // ✅ 서버(socket-server.cjs) 설정과 동일하게 맞춤
      path: "/socket.io",
      transports: ["polling", "websocket"],

      // ✅ 장시간 켜놔도 일시 끊김 후 “재연결 포기”가 없도록 무제한 재시도
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 5000,
    });

    s.on("connect", () => {
      s.emit("join", "global");
    });

    // (선택) 재연결 관련 로그가 필요하면 주석 해제
    // s.on("connect_error", (err) => console.warn("socket connect_error:", err?.message || err));
    // s.on("disconnect", (reason) => console.warn("socket disconnect:", reason));
    // s.on("reconnect_attempt", (n) => console.warn("socket reconnect_attempt:", n));
    // s.on("reconnect", (n) => console.warn("socket reconnected:", n));

    window.__MOYULAB_SOCKET__ = s;
  }
  socket = window.__MOYULAB_SOCKET__;
}

export default socket;


