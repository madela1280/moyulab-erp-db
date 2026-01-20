"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SymphonyRow } from "@/devices/symphony/service/serviceSymphony";
import { listSymphonyRows } from "@/devices/symphony/service/serviceSymphony";

type LoadResult =
  | SymphonyRow[]
  | { rows: SymphonyRow[]; total?: number; baseIndex?: number; count?: number };

function normalizeRowsResult(j: LoadResult): {
  rows: SymphonyRow[];
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

/**
 * 심포니 rows 로딩/리프레시 상태 훅
 * - 실제 데이터는 /api/devices/symphony 에서만
 * - 그리드/뷰에서는 이 훅이 주는 rows/reload만 사용
 */
export function useSymphonyRows() {
  const [rows, setRows] = useState<SymphonyRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [baseIndex, setBaseIndex] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const loadingRef = useRef(false);

  const reload = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError("");

    try {
      // UnifiedGrid와 유사하게 "tailData" 로딩을 기본으로 사용(마지막 데이터 근처부터 보이게)
      const j = await listSymphonyRows({ tailData: 1, limit: 500 });
      const norm = normalizeRowsResult(j as any);

      setRows(norm.rows);
      setTotalCount(norm.totalCount);
      setBaseIndex(norm.baseIndex);
    } catch (e: any) {
      setError(String(e?.message ?? e ?? "FAILED"));
    } finally {
      setLoading(false);
      loadingRef.current = false;
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