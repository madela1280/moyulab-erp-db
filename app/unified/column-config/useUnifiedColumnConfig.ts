// app/unified/column-config/useUnifiedColumnConfig.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { syncListen, syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
import {
  DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  unifiedColumns,
} from "@/unified/columns/unifiedColumns";

type ColumnConfig = {
  columnOrder: string[];
  colWidthUnitByKey: Record<string, number>;
};

function clampUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function sanitizeColumnOrder(input: any): string[] {
  const allowed = new Set(unifiedColumns as unknown as string[]);
  const arr = Array.isArray(input) ? input.map(String) : [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const k of arr) {
    if (!allowed.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }

  // 누락된 컬럼은 뒤에 붙여서 항상 전체 컬럼을 유지
  for (const k of unifiedColumns as unknown as string[]) {
    if (!seen.has(k)) out.push(k);
  }

  return out;
}

function sanitizeWidths(input: any): Record<string, number> {
  const base = { ...DEFAULT_COL_WIDTH_UNIT_BY_KEY };
  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  for (const k of unifiedColumns as unknown as string[]) {
    if (k in input) base[k] = clampUnit((input as any)[k]);
  }
  return base;
}

export function useUnifiedColumnConfig() {
  const [columnOrder, _setColumnOrder] = useState<string[]>([
    ...(unifiedColumns as unknown as string[]),
  ]);
  const [colWidthUnitByKey, _setColWidthUnitByKey] = useState<Record<string, number>>(
    { ...DEFAULT_COL_WIDTH_UNIT_BY_KEY }
  );

  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocalChangeAtRef = useRef<number>(0);

  // 외부에서 쓰는 setter: “로컬 변경 시각” 기록(원격 sync가 와도 바로 덮어쓰지 않게)
  function setColumnOrder(next: string[]) {
    lastLocalChangeAtRef.current = Date.now();
    _setColumnOrder(sanitizeColumnOrder(next));
  }

  function setColWidthUnitByKey(next: Record<string, number>) {
    lastLocalChangeAtRef.current = Date.now();
    _setColWidthUnitByKey(sanitizeWidths(next));
  }

  async function load() {
    const r = await fetch("/api/unified-grid-settings", { cache: "no-store" });
    if (!r.ok) return;

    const j = (await r.json()) as Partial<ColumnConfig>;
    _setColumnOrder(sanitizeColumnOrder(j.columnOrder));
    _setColWidthUnitByKey(sanitizeWidths(j.colWidthUnitByKey));
  }

  async function saveNow(cfg: ColumnConfig) {
    await fetch("/api/unified-grid-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });

    // 같은 사용자/다른 탭에서 즉시 반영이 필요하면 emit (코어 수정 없이 기존 채널 재사용)
    syncEmitUnifiedUpdate();
  }

  // 최초 로드
  useEffect(() => {
    (async () => {
      await load();
      hydratedRef.current = true;
    })();
  }, []);

  // 변경 시 디바운스 저장
  useEffect(() => {
    if (!hydratedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveNow({ columnOrder, colWidthUnitByKey });
    }, 450);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [columnOrder, colWidthUnitByKey]);

  // 원격 업데이트(다른 탭) 반영: 최근 로컬 조작 직후면 덮어쓰지 않음
  useEffect(() => {
    const stop = syncListen(() => {
      const idleMs = Date.now() - lastLocalChangeAtRef.current;
      if (idleMs < 1200) return; // 방금 조작 중이면 무시
      void load();
    });
    return stop;
  }, []);

  return {
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
    reloadColumnConfig: load,
  };
}