import { io } from "socket.io-client";

const SOCKET_URL = "wss://moyulab-socket.onrender.com";

// 싱글톤 전역 저장 (브라우저 전용)
let socket;

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

// default export 필수
export default socket;




