/* global-socket/socket.js */
// 전역 공용 socket 클라이언트 — 절대 수정 금지
import { io } from "socket.io-client";

export const socket = io("wss://moyulab-socket.onrender.com", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1500,
});

socket.on("connect", () => {
  socket.emit("join", "global");
});
