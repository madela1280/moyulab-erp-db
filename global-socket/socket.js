// 🔥 ESM 방식으로 완전 재작성 (Next.js 100% 호환)
import { io } from "socket.io-client";

const SOCKET_URL = "wss://moyulab-socket.onrender.com";

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1500,
});

socket.on("connect", () => {
  socket.emit("join", "global");
});

// 🔥 default export 1개만
export default socket;


