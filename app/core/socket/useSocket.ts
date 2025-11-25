"use client";
import { useEffect } from "react";
import { getSocket } from "./getSocket";

export function useSocket(event: string, callback: () => void) {
  useEffect(() => {
    const s = getSocket();
    s.emit("join", "global");
    s.on(event, callback);

    return () => {
      s.off(event, callback);
    };
  }, [event, callback]);
}
