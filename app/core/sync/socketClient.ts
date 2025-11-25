"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      socket!.emit("join", "global");
    });
  }

  return socket!;
}
