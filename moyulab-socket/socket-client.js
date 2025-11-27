// 브라우저 전용 안정형 socket client
import { io } from "socket.io-client";

let socket = null;

if (typeof window !== "undefined") {
  if (!window.__MOYULAB_SOCKET__) {
    window.__MOYULAB_SOCKET__ = io("https://moyulab-socket.onrender.com", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
    });

    window.__MOYULAB_SOCKET__.on("connect", () => {
      window.__MOYULAB_SOCKET__.emit("join", "global");
    });
  }

  socket = window.__MOYULAB_SOCKET__;
}

export default socket;




