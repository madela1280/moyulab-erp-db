"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  symphonyColumns,
} from "@/devices/symphony/columns/symphonyColumns";

type ColumnConfig = {
  columnOrder: string[];
  colWidthUnitByKey: Record<string, number>;
};

function clampUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

// 유저 순서를 최대한 유지하면서, 전역 컬럼 목록 기준으로 누락 컬럼을 “가까운 위치”에 끼워 넣음
function mergeUserOrderWithGlobal(userOrder: any, globalOrder: string[]) {
  const gSet = new Set(globalOrder);

  const base = Array.isArray(userOrder) ? userOrder.map(String) : [];
  const filtered = base.filter((k) => gSet.has(k));

  const result: string[] = [];
  const rSet = new Set<string>();

  for (const k of filtered) {
    if (rSet.has(k)) continue;
    rSet.add(k);
    result.push(k);
  }

  for (let i = 0; i < globalOrder.length; i++) {
    const k = globalOrder[i];
    if (rSet.has(k)) continue;

    let inserted = false;

    // 1) global에서 이전 키 중 result에 존재하는 가장 가까운 prev 뒤에 삽입
    for (let j = i - 1; j >= 0; j--) {
      const prev = globalOrder[j];
      const idx = result.indexOf(prev);
      if (idx >= 0) {
        result.splice(idx + 1, 0, k);
        inserted = true;
        break;
      }
    }

    // 2) 없으면 global에서 다음 키 중 result에 존재하는 next 앞에 삽입
    if (!inserted) {
      for (let j = i + 1; j < globalOrder.length; j++) {
        const next = globalOrder[j];
        const idx = result.indexOf(next);
        if (idx >= 0) {
          result.splice(idx, 0, k);
          inserted = true;
          break;
        }
      }
    }

    // 3) 그래도 없으면 맨 뒤
    if (!inserted) result.push(k);

    rSet.add(k);
  }

  return result;
}

function sanitizeWidths(input: any, globalOrder: string[]) {
  const base: Record<string, number> = {};

  // 기본값 세팅
  for (const k of symphonyColumns as unknown as string[]) {
    base[k] = DEFAULT_COL_WIDTH_UNIT_BY_KEY[k] ?? 20;
  }
  for (const k of globalOrder) {
    if (!(k in base)) base[k] = 20;
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  for (const k of globalOrder) {
    if (k in input) base[k] = clampUnit((input as any)[k]);
  }
  return base;
}

/**
 * 심포니 컬럼 순서/폭 설정 훅 (DB + /api/devices/symphony/grid-settings)
 */
export function useSymphonyColumnConfig() {
  const globalOrder = [...(symphonyColumns as unknown as string[])];

  const [availableColumns, setAvailableColumns] = useState<string[]>(globalOrder);
  const [columnOrder, _setColumnOrder] = useState<string[]>(globalOrder);
  const [colWidthUnitByKey, _setColWidthUnitByKey] = useState<Record<string, number>>({
    ...DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  });

  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setColumnOrder(next: string[]) {
    const gSet = new Set(availableColumns);
    const filtered = next.filter((k) => gSet.has(k));
    _setColumnOrder(mergeUserOrderWithGlobal(filtered, availableColumns));
  }

  function setColWidthUnitByKey(next: Record<string, number>) {
    _setColWidthUnitByKey(sanitizeWidths(next, availableColumns));
  }

  async function loadUserConfig() {
    const r = await fetch("/api/devices/symphony/grid-settings", { cache: "no-store" });
    if (!r.ok) return;

    const j = (await r.json()) as Partial<ColumnConfig>;
    _setColumnOrder(mergeUserOrderWithGlobal(j.columnOrder, globalOrder));
    _setColWidthUnitByKey(sanitizeWidths(j.colWidthUnitByKey, globalOrder));
  }

  async function saveNow(cfg: ColumnConfig) {
    await fetch("/api/devices/symphony/grid-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
  }

  async function reloadAllColumnState() {
    // 심포니는 전역 컬럼 목록이 고정(현재)
    setAvailableColumns(globalOrder);
    await loadUserConfig();

    // 안전 보정
    _setColumnOrder((prev) => mergeUserOrderWithGlobal(prev, globalOrder));
    _setColWidthUnitByKey((prev) => sanitizeWidths(prev, globalOrder));
  }

  // 최초 로드
  useEffect(() => {
    (async () => {
      try {
        await reloadAllColumnState();
      } finally {
        hydratedRef.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return {
    availableColumns,
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
    reloadAllColumnState,
  };
}