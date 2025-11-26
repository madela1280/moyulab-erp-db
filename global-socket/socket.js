import { io } from "socket.io-client";

const SOCKET_URL = "wss://moyulab-socket.onrender.com";

if (typeof window !== "undefined" && !window.socketInstance) {
  const s = io(SOCKET_URL, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1500,
  });

  s.on("connect", () => {
    s.emit("join", "global");
  });

  window.socketInstance = s;
}

const socket = typeof window !== "undefined" ? window.socketInstance : null;

export default socket;



