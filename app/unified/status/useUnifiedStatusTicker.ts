// app/unified/status/useUnifiedStatusTicker.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { todayStart } from "./parseUnifiedDate";

/**
 * "입력 변화가 없어도" 날짜가 바뀌면(자정) 상태표시가 자동으로 바뀌어야 하는 요구 대응.
 * - 자정마다 dayKey를 갱신해서 화면이 재계산/재렌더 되도록 트리거를 제공
 * - 필요하면 onNewDay 콜백(예: reload())도 실행 가능
 *
 * 사용 예)
 * const { dayKey } = useUnifiedStatusTicker(() => reload());
 * // dayKey를 의존성으로 상태 재계산
 */
export function useUnifiedStatusTicker(onNewDay?: () => void) {
  const onNewDayRef = useRef(onNewDay);
  useEffect(() => {
    onNewDayRef.current = onNewDay;
  }, [onNewDay]);

  const [dayKey, setDayKey] = useState(() => formatDayKey(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      const now = new Date();
      // 다음날 00:00:01에 트리거(자정 경계 오차/지연 대비)
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      const ms = Math.max(0, next.getTime() - now.getTime());

      timer = setTimeout(() => {
        setDayKey(formatDayKey(new Date()));
        onNewDayRef.current?.();
        scheduleNext(); // DST 등 변동 대비: 매번 다시 계산
      }, ms);
    };

    scheduleNext();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  const today = useMemo(() => todayStart(new Date()), [dayKey]);

  return { dayKey, today };
}

function formatDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}