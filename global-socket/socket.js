import { io } from "socket.io-client";

const SOCKET_URL = "wss://moyulab-socket.onrender.com";

let socketInstance = null;

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

  socketInstance = window.__GLOBAL_SOCKET__;
}

export default socketInstance;
