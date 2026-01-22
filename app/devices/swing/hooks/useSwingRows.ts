"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SwingRow } from "@/devices/swing/service/serviceSwing";
import { listSwingRows } from "@/devices/swing/service/serviceSwing";

type LoadResult =
  | SwingRow[]
  | { rows: SwingRow[]; total?: number; baseIndex?: number; count?: number };

function normalizeRowsResult(j: LoadResult): {
  rows: SwingRow[];
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

/**
 * 스윙 rows 로딩/리프레시 상태 훅
 * - 실제 데이터는 /api/devices/swing 에서만
 * - 그리드/뷰에서는 이 훅이 주는 rows/reload만 사용
 */
export function useSwingRows() {
  const [rows, setRows] = useState<SwingRow[]>([]);
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
      const j = await listSwingRows({ tailData: 1, limit: 500 });
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