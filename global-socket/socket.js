import { io } from "socket.io-client";

// 타입 오류 제거용 선언
// (TS가 window 객체 확장 허용하도록 강제)
declare const window: any;

const SOCKET_URL = "wss://moyulab-socket.onrender.com";

if (typeof window !== "undefined") {
  if (!window.__GLOBAL_SOCKET__) {
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
}

const socket = typeof window !== "undefined" ? window.__GLOBAL_SOCKET__ : null;
export default socket;

