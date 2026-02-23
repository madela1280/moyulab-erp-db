"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncListen } from "@/global-sync/sync-engine";
import {
  DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  unifiedColumns,
} from "@/unified/columns/unifiedColumns";
import type { RecoveryScope } from "@/recoveryComplete/components/RecoveryMain";

type ColumnConfig = {
  columnOrder: string[];
  colWidthUnitByKey: Record<string, number>;
};

function clampUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

// 전역 컬럼 목록(기본+커스텀) 기준으로, 유저 순서를 최대한 유지하면서 누락 컬럼을 삽입
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

    // prev 뒤에
    for (let j = i - 1; j >= 0; j--) {
      const prev = globalOrder[j];
      const idx = result.indexOf(prev);
      if (idx >= 0) {
        result.splice(idx + 1, 0, k);
        inserted = true;
        break;
      }
    }

    // next 앞에
    if (!inserted) {
      for (let j = i + 1; j < globalOrder.length; j--) {
        // (방어) 아래에서 즉시 break되므로 무한루프 방지 위해 구조 변경
        break;
      }
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

    if (!inserted) result.push(k);
    rSet.add(k);
  }

  return result;
}

function sanitizeWidths(input: any, globalOrder: string[]) {
  const base: Record<string, number> = {};

  // 기본컬럼 기본값
  for (const k of unifiedColumns as unknown as string[]) {
    base[k] = DEFAULT_COL_WIDTH_UNIT_BY_KEY[k] ?? 20;
  }

  // 커스텀컬럼 기본값 확장
  for (const k of globalOrder) {
    if (!(k in base)) base[k] = 20;
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  for (const k of globalOrder) {
    if (k in input) base[k] = clampUnit((input as any)[k]);
  }

  return base;
}

function getSettingsApiPath(scope: RecoveryScope) {
  return scope === "recovery1"
    ? "/api/recovery1/grid-settings"
    : "/api/recovery2/grid-settings";
}

export function useRecoveryColumnConfig(scope: RecoveryScope) {
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

  // unified:update는 셀 편집에도 발생 → 재로드 폭주 방지
  const lastRemoteReloadAtRef = useRef<number>(0);
  const REMOTE_RELOAD_MIN_INTERVAL_MS = 20000;

  const canSave = useMemo(() => hydratedRef.current, [hydratedRef.current]);

  function setColumnOrder(next: string[]) {
    lastLocalChangeAtRef.current = Date.now();

    const gSet = new Set(availableColumns);
    const filtered = next.filter((k) => gSet.has(k));
    _setColumnOrder(mergeUserOrderWithGlobal(filtered, availableColumns));
  }

  function setColWidthUnitByKey(next: Record<string, number>) {
    lastLocalChangeAtRef.current = Date.now();
    _setColWidthUnitByKey(sanitizeWidths(next, availableColumns));
  }

  async function loadAvailableColumns() {
    // ✅ 통합관리 양식과 동일: 전역 컬럼(기본+커스텀)은 unified-columns 기준
    const r = await fetch("/api/unified-columns", { cache: "no-store" });
    if (!r.ok) return;

    const j = await r.json().catch(() => null);
    const order = Array.isArray(j?.order) ? j.order.map(String) : [];

    const safe =
      order.length > 0 ? order : ([...(unifiedColumns as unknown as string[])] as string[]);

    setAvailableColumns(safe);
    return safe;
  }

  async function loadUserConfig(globalOrder: string[]) {
    const apiPath = getSettingsApiPath(scope);
    const r = await fetch(apiPath, { cache: "no-store" });
    if (!r.ok) return;

    const j = (await r.json().catch(() => null)) as Partial<ColumnConfig> | null;
    _setColumnOrder(mergeUserOrderWithGlobal(j?.columnOrder, globalOrder));
    _setColWidthUnitByKey(sanitizeWidths(j?.colWidthUnitByKey, globalOrder));
  }

  async function saveNow(cfg: ColumnConfig) {
    const apiPath = getSettingsApiPath(scope);
    await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
  }

  async function reloadAllColumnState() {
    const globalOrder = (await loadAvailableColumns()) ?? availableColumns;
    await loadUserConfig(globalOrder);

    _setColumnOrder((prev) => mergeUserOrderWithGlobal(prev, globalOrder));
    _setColWidthUnitByKey((prev) => sanitizeWidths(prev, globalOrder));
  }

  // 최초 로드
  useEffect(() => {
    (async () => {
      const globalOrder = (await loadAvailableColumns()) ?? availableColumns;
      await loadUserConfig(globalOrder);

      _setColumnOrder((prev) => mergeUserOrderWithGlobal(prev, globalOrder));
      _setColWidthUnitByKey((prev) => sanitizeWidths(prev, globalOrder));

      hydratedRef.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // 변경 시 디바운스 저장
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
      const now = Date.now();

      const idleMs = now - lastLocalChangeAtRef.current;
      if (idleMs < 1200) return;

      if (now - lastRemoteReloadAtRef.current < REMOTE_RELOAD_MIN_INTERVAL_MS) return;

      const el =
        typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

      lastRemoteReloadAtRef.current = now;
      void reloadAllColumnState();
    });

    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableColumns, scope]);

  return {
    availableColumns,
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
    reloadAllColumnState,
  };
}