// app/core/sync/syncManager.ts

import { getSocket } from "./socketClient";

type Listener = () => void;

class SyncManager {
  private listeners: Listener[] = [];
  private socket = getSocket();

  constructor() {
    this.socket.on("unified:update", () => {
      this.listeners.forEach((fn) => fn());
    });
  }

  subscribe(fn: Listener) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  // 저장 후 모든 클라이언트에게 동기화 요청 방송
  broadcast() {
    this.socket.emit("unified:update");
  }
}

export const syncManager = new SyncManager();
