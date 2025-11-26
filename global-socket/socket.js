// @ts-nocheck
import { io } from "socket.io-client";

const SOCKET_URL = "wss://moyulab-socket.onrender.com";

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

export default socket;





