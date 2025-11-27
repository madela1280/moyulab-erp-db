// @ts-nocheck
"use client";   // ✅ 이 한 줄이 문제 해결의 핵심

import { io } from "socket.io-client";

const SOCKET_URL = "wss://moulab.kr/socket.io";

let socket = null;

if (typeof window !== "undefined") {
  if (!window.__MOYULAB_SOCKET__) {
    const s = io(SOCKET_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
    });

    s.on("connect", () => {
      s.emit("join", "global");
    });

    window.__MOYULAB_SOCKET__ = s;
  }

  socket = window.__MOYULAB_SOCKET__;
}

export default socket;





