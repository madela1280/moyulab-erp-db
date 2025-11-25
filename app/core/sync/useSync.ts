// app/core/sync/useSync.ts

"use client";

import { useEffect } from "react";
import { syncManager } from "./syncManager";

export function useSync(onUpdate: () => void) {
  useEffect(() => {
    const unsubscribe = syncManager.subscribe(onUpdate);
    return () => unsubscribe();
  }, [onUpdate]);
}

