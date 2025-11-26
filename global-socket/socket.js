/* global-socket/socket.js (CJS 싱글톤 완성본) */

const { io } = require("socket.io-client");
const SOCKET_URL = "wss://moyulab-socket.onrender.com";

// 싱글톤 저장공간 (브라우저 전용)
if (typeof window !== "undefined") {
  if (!window.__MOYULAB_SOCKET__) {
    const s = io(SOCKET_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1500,
    });

    s.on("connect", () => {
      s.emit("join", "global");
    });

    window.__MOYULAB_SOCKET__ = s;
  }

  module.exports = window.__MOYULAB_SOCKET__;
} else {
  // SSR 환경에서는 빈 객체 반환
  module.exports = {};
}



