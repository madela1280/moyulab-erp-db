"use client";
// @ts-nocheck

import { io } from "socket.io-client";

let socket = null;

if (typeof window !== "undefined") {
  if (!window.__MOYULAB_SOCKET__) {
    const s = io("https://moulab.kr", {
      path: "/socket.io/",
      transports: ["polling", "websocket"],
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


