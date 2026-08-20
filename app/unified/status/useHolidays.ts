// app/unified/status/useHolidays.ts
"use client";

import { useEffect, useState } from "react";

/**
 * 공휴일 날짜 목록(YYYY-MM-DD Set)을 한 번만 불러와서 재사용.
 * calcUnifiedStatus에 넘겨서 "만기3일전(공휴일)" 같은 파생 상태를 계산하는 용도.
 */
export function useHolidays() {
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const r = await fetch("/api/holidays", { cache: "no-store" });
        const j = await r.json().catch(() => null);

        if (!cancelled && r.ok && Array.isArray(j?.dates)) {
          setHolidays(new Set(j.dates.map((d: unknown) => String(d))));
        }
      } catch {
        // ignore: 실패해도 공휴일 강조 표시만 안 될 뿐, 다른 기능에 영향 없음
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { holidays, loading };
}
