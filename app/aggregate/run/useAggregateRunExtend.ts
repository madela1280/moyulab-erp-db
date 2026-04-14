"use client";

import { useCallback, useState } from "react";
import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";
import type { AggregateRunExtendResponse } from "@/aggregate/run/types.aggregateExtendResult";
import { runAggregateExtend } from "@/aggregate/run/serviceAggregateRunExtend";

export function useAggregateRunExtend() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AggregateRunExtendResponse | null>(null);

  const execute = useCallback(async (request: AggregateRunRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await runAggregateExtend(request);
      setResult(res);
      return res;
    } catch (e: any) {
      setError(e?.message || "연장 집계 실행 실패");
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