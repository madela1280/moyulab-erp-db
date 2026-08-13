"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addUnifiedDeviceStatusOption,
  fetchUnifiedDeviceStatusOptions,
  removeUnifiedDeviceStatusOption,
} from "@/unified/device-status-options/serviceUnifiedDeviceStatusOptions";
import { syncListen } from "@/global-sync/sync-engine";

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function normalizeOptions(list: any): string[] {
  if (!Array.isArray(list)) return [];

  return Array.from(
    new Set(
      list
        .map(normalizeName)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ko"));
}

export function useUnifiedDeviceStatusOptions() {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const mountedRef = useRef(false);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const next = await fetchUnifiedDeviceStatusOptions();
      if (!mountedRef.current) return;
      setOptions(normalizeOptions(next));
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(String(e?.message ?? "LOAD_UNIFIED_DEVICE_STATUS_OPTIONS_FAILED"));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const add = useCallback(async (name: string) => {
    const n = normalizeName(name);
    if (!n) return;

    setLoading(true);
    setError("");

    try {
      const next = await addUnifiedDeviceStatusOption(n);
      if (!mountedRef.current) return;
      setOptions(normalizeOptions(next));
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(String(e?.message ?? "ADD_UNIFIED_DEVICE_STATUS_OPTION_FAILED"));
      throw e;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const remove = useCallback(async (name: string) => {
    const n = normalizeName(name);
    if (!n) return;

    setLoading(true);
    setError("");

    try {
      const next = await removeUnifiedDeviceStatusOption(n);
      if (!mountedRef.current) return;
      setOptions(normalizeOptions(next));
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(String(e?.message ?? "REMOVE_UNIFIED_DEVICE_STATUS_OPTION_FAILED"));
      throw e;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();

    return () => {
      mountedRef.current = false;
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [load]);

  useEffect(() => {
    const stop = syncListen(() => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);

      reloadTimerRef.current = setTimeout(() => {
        reloadTimerRef.current = null;
        void load();
      }, 200);
    });

    return () => {
      stop?.();
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [load]);

  return {
    options,
    loading,
    error,
    reload: load,
    add,
    remove,
  };
}