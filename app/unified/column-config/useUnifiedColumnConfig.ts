"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncListen } from "@/global-sync/sync-engine";
import { DEFAULT_COL_WIDTH_UNIT_BY_KEY, unifiedColumns } from "@/unified/columns/unifiedColumns";

type ColumnConfig = {
  columnOrder: string[];
  colWidthUnitByKey: Record<string, number>;
};

function clampUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

// 전역 컬럼 목록(기본+커스텀) 기준으로, 유저 순서를 최대한 유지하면서 누락 컬럼을 “삽입 위치에 맞게” 끼워 넣음
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

  // globalOrder를 순회하며 result에 없는 키를 “가까운 위치”에 삽입
  for (let i = 0; i < globalOrder.length; i++) {
    const k = globalOrder[i];
    if (rSet.has(k)) continue;

    // 1) global에서 이전 키 중 result에 존재하는 가장 가까운 prev 뒤에 삽입
    let inserted = false;
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

  // 기본컬럼은 기본값(20) 세팅
  for (const k of unifiedColumns as unknown as string[]) {
    base[k] = DEFAULT_COL_WIDTH_UNIT_BY_KEY[k] ?? 20;
  }

  // 전역 컬럼에 대해 기본값 확장(커스텀도 20 기본)
  for (const k of globalOrder) {
    if (!(k in base)) base[k] = 20;
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  for (const k of globalOrder) {
    if (k in input) base[k] = clampUnit((input as any)[k]);
  }
  return base;
}

export function useUnifiedColumnConfig() {
  const [availableColumns, setAvailableColumns] = useState<string[]>([
    ...(unifiedColumns as unknown as string[]),
  ]);

  const [columnOrder, _setColumnOrder] = useState<string[]>([
    ...(unifiedColumns as unknown as string[]),
  ]);

  const [colWidthUnitByKey, _setColWidthUnitByKey] = useState<Record<string, number>>({
    ...DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  });

  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocalChangeAtRef = useRef<number>(0);

  const canSave = useMemo(() => hydratedRef.current, [hydratedRef.current]);

  function setColumnOrder(next: string[]) {
    lastLocalChangeAtRef.current = Date.now();

    // 유저가 드래그/이동한 순서도 전역 컬럼 집합 안에서만 유지
    const gSet = new Set(availableColumns);
    const filtered = next.filter((k) => gSet.has(k));
    _setColumnOrder(mergeUserOrderWithGlobal(filtered, availableColumns));
  }

  function setColWidthUnitByKey(next: Record<string, number>) {
    lastLocalChangeAtRef.current = Date.now();
    _setColWidthUnitByKey(sanitizeWidths(next, availableColumns));
  }

  async function loadAvailableColumns() {
    const r = await fetch("/api/unified-columns", { cache: "no-store" });
    if (!r.ok) return;

    const j = await r.json();
    const order = Array.isArray(j?.order) ? j.order.map(String) : [];

    // 최소 방어: 전역 컬럼이 비면 기본 컬럼으로 fallback
    const safe = order.length ? order : ([...(unifiedColumns as unknown as string[])] as string[]);
    setAvailableColumns(safe);
    return safe;
  }

  async function loadUserConfig(globalOrder: string[]) {
    const r = await fetch("/api/unified-grid-settings", { cache: "no-store" });
    if (!r.ok) return;

    const j = (await r.json()) as Partial<ColumnConfig>;
    _setColumnOrder(mergeUserOrderWithGlobal(j.columnOrder, globalOrder));
    _setColWidthUnitByKey(sanitizeWidths(j.colWidthUnitByKey, globalOrder));
  }

  async function saveNow(cfg: ColumnConfig) {
    await fetch("/api/unified-grid-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
  }

  async function reloadAllColumnState() {
    const globalOrder = (await loadAvailableColumns()) ?? availableColumns;
    await loadUserConfig(globalOrder);

    // 전역 컬럼 변경 시, 현재 state도 전역 기준으로 누락 없이 보정
    _setColumnOrder((prev) => mergeUserOrderWithGlobal(prev, globalOrder));
    _setColWidthUnitByKey((prev) => sanitizeWidths(prev, globalOrder));
  }

  // 최초 로드
  useEffect(() => {
    (async () => {
      const globalOrder = (await loadAvailableColumns()) ?? availableColumns;
      await loadUserConfig(globalOrder);

      // 안전 보정
      _setColumnOrder((prev) => mergeUserOrderWithGlobal(prev, globalOrder));
      _setColWidthUnitByKey((prev) => sanitizeWidths(prev, globalOrder));

      hydratedRef.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 변경 시 디바운스 저장(유저별 설정)
  useEffect(() => {
    if (!canSave) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveNow({ columnOrder, colWidthUnitByKey });
    }, 450);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [columnOrder, colWidthUnitByKey, canSave]);

  // 전역 변경(양식추가 등) sync 수신 시 재로딩
  useEffect(() => {
    const stop = syncListen(() => {
      const idleMs = Date.now() - lastLocalChangeAtRef.current;
      if (idleMs < 1200) return; // 방금 조작 중이면 덮어쓰기 방지
      void reloadAllColumnState();
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableColumns]);

  return {
    availableColumns,
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
    reloadAllColumnState,
  };
}