import { io } from "socket.io-client";

// JS 환경 전용 window 확장 (TS 문법 아님)
if (typeof window !== "undefined" && !window.__GLOBAL_SOCKET__) {
  const SOCKET_URL = "wss://moyulab-socket.onrender.com";

  const s = io(SOCKET_URL, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1500,
  });

  s.on("connect", () => {
    s.emit("join", "global");
  });

  window.__GLOBAL_SOCKET__ = s;
}

// 브라우저일 때만 반환
const socket =
  typeof window !== "undefined" ? window.__GLOBAL_SOCKET__ : null;

export default socket;


