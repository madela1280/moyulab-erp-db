"use client";

import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io("wss://moulab.kr:4001", {
      path: "/socket.io",
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
      forceNew: false,
    });
  }
  return socket;
}
