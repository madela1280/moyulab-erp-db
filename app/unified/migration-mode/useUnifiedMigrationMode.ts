"use client";

import { useCallback, useState } from "react";

export function useUnifiedMigrationMode() {
  const [enabled, setEnabled] = useState(false);

  const turnOn = useCallback(() => {
    setEnabled(true);
  }, []);

  const turnOff = useCallback(() => {
    setEnabled(false);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  return {
    enabled,
    setEnabled,
    turnOn,
    turnOff,
    toggle,
  };
}