"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SimileRow } from "@/devices/simile/service/serviceSimile";
import { listSimileRows } from "@/devices/simile/service/serviceSimile";

type LoadResult =
  | SimileRow[]
  | { rows: SimileRow[]; total?: number; baseIndex?: number; count?: number };

function normalizeRowsResult(j: LoadResult): {
  rows: SimileRow[];
  totalCount: number;
  baseIndex: number;
} {
  if (Array.isArray(j)) {
    return { rows: j, totalCount: j.length, baseIndex: 1 };
  }
  return {
    rows: j.rows ?? [],
    totalCount: Number(j.total ?? (j.rows?.length ?? 0)),
    baseIndex: Number(j.baseIndex ?? 1),
  };
}

type ReloadOptions = {
  silent?: boolean;
};

export function useSimileRows() {
  const [rows, setRows] = useState<SimileRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [baseIndex, setBaseIndex] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const inFlightRef = useRef(false);
  const pendingRef = useRef<ReloadOptions | null>(null);

  const reload = useCallback(async (options?: ReloadOptions) => {
    if (inFlightRef.current) {
      pendingRef.current = options ?? {};
      return;
    }

    inFlightRef.current = true;

    const silent = !!options?.silent;

    if (!silent) setLoading(true);
    setError("");

    try {
      const j = await listSimileRows({ tailData: 1, limit: 5000 });
      const norm = normalizeRowsResult(j as any);

      setRows(norm.rows);
      setTotalCount(norm.totalCount);
      setBaseIndex(norm.baseIndex);
    } catch (e: any) {
      setError(String(e?.message ?? e ?? "FAILED"));
    } finally {
      if (!silent) setLoading(false);
      inFlightRef.current = false;

      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        await reload(pending);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    rows,
    setRows,
    totalCount,
    setTotalCount,
    baseIndex,
    setBaseIndex,
    loading,
    error,
    reload,
  };
}