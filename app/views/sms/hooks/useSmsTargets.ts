// app/views/sms/hooks/useSmsTargets.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SmsSubCategory, SmsTargetRow } from "@/sms/types/sms.types";
import { fetchSmsTargets } from "@/views/sms/service/serviceSms";

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
  /**
   * (레거시 호환용) 예전에는 true면 최초 1회 집계(aggregate) 실행 후 targets 로딩을 했지만,
   * 현재 정책: 집계는 05시 배치 1회만 수행(화면에서 수동 집계/증분 집계 금지)
   * → 이 옵션은 무시된다.
   */
  aggregateOnMount?: boolean;
}) {
  const { subCategory, baseDate } = args;

  const [state, setState] = useState<State>({
    loading: true,
    error: null,
    rows: [],
    baseDate: baseDate ?? "",
  });

  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const mySeq = ++seqRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
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
  }, [subCategory, baseDate]);

  // 최초 로딩 + subCategory/baseDate 변경 시 재로딩
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subCategory, baseDate]);

  const refresh = useCallback(async () => {
    await load();
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
  };
}