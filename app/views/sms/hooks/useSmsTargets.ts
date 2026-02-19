// app/views/sms/hooks/useSmsTargets.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SmsSubCategory, SmsTargetRow } from "@/sms/types/sms.types";
import { fetchSmsTargets, runSmsAggregate } from "@/views/sms/service/serviceSms";

type State = {
  loading: boolean;
  error: string | null;
  rows: SmsTargetRow[];
  baseDate: string; // 서버가 확정해서 내려준 YYYY-MM-DD
};

export function useSmsTargets(args: {
  subCategory: SmsSubCategory;
  /** YYYY-MM-DD, 없으면 서버 today 기준 */
  baseDate?: string;
  /** true면 최초 1회 집계(aggregate) 실행 후 targets 로딩 */
  aggregateOnMount?: boolean;
}) {
  const { subCategory, baseDate, aggregateOnMount } = args;

  const [state, setState] = useState<State>({
    loading: true,
    error: null,
    rows: [],
    baseDate: baseDate ?? "",
  });

  const seqRef = useRef(0);

  const load = useCallback(
    async (opts?: { runAggregate?: boolean }) => {
      const mySeq = ++seqRef.current;
      setState((s) => ({ ...s, loading: true, error: null }));

      try {
        if (opts?.runAggregate) {
          await runSmsAggregate({ baseDate });
        }

        const res = await fetchSmsTargets({ subCategory, baseDate });

        if (mySeq !== seqRef.current) return;
        setState({
          loading: false,
          error: null,
          rows: res.rows,
          baseDate: res.baseDate,
        });
      } catch (e: any) {
        if (mySeq !== seqRef.current) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: String(e?.message || e || "load_failed"),
        }));
      }
    },
    [subCategory, baseDate]
  );

  // 최초 로딩
  useEffect(() => {
    void load({ runAggregate: !!aggregateOnMount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subCategory, baseDate, aggregateOnMount]);

  const refresh = useCallback(async () => {
    await load({ runAggregate: false });
  }, [load]);

  const aggregateAndRefresh = useCallback(async () => {
    await load({ runAggregate: true });
  }, [load]);

  const counts = useMemo(() => {
    const total = state.rows.length;
    const byStatus: Record<string, number> = {};
    for (const r of state.rows) {
      const k = String(r.target_status || "pending");
      byStatus[k] = (byStatus[k] ?? 0) + 1;
    }
    return { total, byStatus };
  }, [state.rows]);

  return {
    ...state,
    counts,
    refresh,
    aggregateAndRefresh,
  };
}