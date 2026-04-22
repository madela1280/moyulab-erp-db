"use client";

import { useCallback, useState } from "react";
import type { AggregateRunRequest } from "./types.aggregateRun";
import type { AggregateRunResponse } from "./types.aggregateResult";
import { runAggregatePartnerAll } from "./serviceAggregateRunPartnerAll";

export function useAggregateRunPartnerAll() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AggregateRunResponse | null>(null);

  const execute = useCallback(async (request: AggregateRunRequest) => {
    setLoading(true);
    setError(null);

    try {
      const res = await runAggregatePartnerAll(request);
      setResult(res);
      return res;
    } catch (e: any) {
      setError(e?.message || "거래처 전체 집계 실행 실패");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    result,
    setResult,
    execute,
  };
}