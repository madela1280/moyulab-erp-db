"use client";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io("wss://moulab.kr:4001", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 2000,
    });
  }
  return socket;
}
