"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncListen } from "@/global-sync/sync-engine";
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

function toStringList(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input.map(String).map((v) => v.trim()).filter(Boolean);
}

function uniqueList(list: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const k of list) {
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }

  return out;
}

function getBaseColumns() {
  return [...(unifiedColumns as unknown as string[])];
}

/**
 * 핵심:
 * - globalOrder(/api/unified-columns)에 없는 컬럼이라도
 *   userOrder(/api/unified-grid-settings)에 있으면 버리지 않는다.
 * - 그래서 6차~15차연장 같은 기존 커스텀 컬럼이 화면에서 사라지지 않는다.
 */
function buildEffectiveGlobalOrder(globalOrderInput: any, userOrderInput?: any) {
  const baseColumns = getBaseColumns();
  const globalOrder = toStringList(globalOrderInput);
  const userOrder = toStringList(userOrderInput);

  const seed = globalOrder.length ? globalOrder : baseColumns;

  return uniqueList([
    ...seed,
    ...userOrder.filter((k) => !seed.includes(k)),
  ]);
}

// 전역 컬럼 목록(기본+커스텀) 기준으로, 유저 순서를 최대한 유지하면서 누락 컬럼을 “삽입 위치에 맞게” 끼워 넣음
function mergeUserOrderWithGlobal(userOrder: any, globalOrder: string[]) {
  const effectiveGlobal = buildEffectiveGlobalOrder(globalOrder, userOrder);
  const gSet = new Set(effectiveGlobal);

  const base = toStringList(userOrder);
  const filtered = base.filter((k) => gSet.has(k));

  const result: string[] = [];
  const rSet = new Set<string>();

  for (const k of filtered) {
    if (rSet.has(k)) continue;
    rSet.add(k);
    result.push(k);
  }

  // effectiveGlobal을 순회하며 result에 없는 키를 “가까운 위치”에 삽입
  for (let i = 0; i < effectiveGlobal.length; i++) {
    const k = effectiveGlobal[i];
    if (rSet.has(k)) continue;

    let inserted = false;

    // 1) global에서 이전 키 중 result에 존재하는 가장 가까운 prev 뒤에 삽입
    for (let j = i - 1; j >= 0; j--) {
      const prev = effectiveGlobal[j];
      const idx = result.indexOf(prev);
      if (idx >= 0) {
        result.splice(idx + 1, 0, k);
        inserted = true;
        break;
      }
    }

    // 2) 없으면 global에서 다음 키 중 result에 존재하는 next 앞에 삽입
    if (!inserted) {
      for (let j = i + 1; j < effectiveGlobal.length; j++) {
        const next = effectiveGlobal[j];
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

function sanitizeWidths(input: any, globalOrder: string[], userOrder?: any) {
  const effectiveGlobal = buildEffectiveGlobalOrder(globalOrder, userOrder);

  const base: Record<string, number> = {};

  // 기본컬럼은 기본값 세팅
  for (const k of getBaseColumns()) {
    base[k] = DEFAULT_COL_WIDTH_UNIT_BY_KEY[k] ?? 20;
  }

  // 전역/사용자 컬럼에 대해 기본값 확장
  for (const k of effectiveGlobal) {
    if (!(k in base)) base[k] = 20;
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  // effectiveGlobal 컬럼 폭 보존
  for (const k of effectiveGlobal) {
    if (k in input) base[k] = clampUnit((input as any)[k]);
  }

  // 혹시 width에는 있는데 order에 없는 커스텀 컬럼 폭도 보존
  for (const k of Object.keys(input)) {
    if (!(k in base)) base[k] = clampUnit((input as any)[k]);
  }

  return base;
}

export function useUnifiedColumnConfig() {
  const [availableColumns, setAvailableColumns] = useState<string[]>([
    ...getBaseColumns(),
  ]);

  const [columnOrder, _setColumnOrder] = useState<string[]>([
    ...getBaseColumns(),
  ]);

  const [colWidthUnitByKey, _setColWidthUnitByKey] = useState<Record<string, number>>({
    ...DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  });

  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocalChangeAtRef = useRef<number>(0);

  // ✅ unified:update는 통합관리 셀 편집에도 매번 발생함 → 컬럼설정 재로드가 폭주하면
  //    Grid가 크게 리렌더되어 입력/삭제가 “점멸/복구/50%만 입력”처럼 보일 수 있음
  const lastRemoteReloadAtRef = useRef<number>(0);
  const REMOTE_RELOAD_MIN_INTERVAL_MS = 20000;

  const canSave = useMemo(() => hydratedRef.current, [hydratedRef.current]);

  function setColumnOrder(next: string[]) {
    lastLocalChangeAtRef.current = Date.now();

    // ✅ availableColumns에 없더라도 기존 columnOrder에 있던 커스텀 컬럼은 버리지 않음
    const effectiveGlobal = buildEffectiveGlobalOrder(availableColumns, columnOrder);
    const nextOrder = mergeUserOrderWithGlobal(next, effectiveGlobal);

    _setColumnOrder(nextOrder);
    setAvailableColumns((prev) => buildEffectiveGlobalOrder(prev, nextOrder));
  }

  function setColWidthUnitByKey(next: Record<string, number>) {
    lastLocalChangeAtRef.current = Date.now();

    const effectiveGlobal = buildEffectiveGlobalOrder(availableColumns, columnOrder);
    _setColWidthUnitByKey(sanitizeWidths(next, effectiveGlobal, columnOrder));
  }

  async function loadAvailableColumns() {
    const r = await fetch("/api/unified-columns", { cache: "no-store" });
    if (!r.ok) return;

    const j = await r.json().catch(() => null);
    const order = Array.isArray(j?.order) ? j.order.map(String) : [];

    // 최소 방어: 전역 컬럼이 비면 기본 컬럼으로 fallback
    const safe = order.length ? order : getBaseColumns();

    setAvailableColumns((prev) => buildEffectiveGlobalOrder(safe, prev));
    return safe;
  }

  async function loadUserConfig(globalOrderInput: string[]) {
    const r = await fetch("/api/unified-grid-settings", { cache: "no-store" });
    if (!r.ok) return;

    const j = (await r.json().catch(() => null)) as Partial<ColumnConfig> | null;

    const userOrder = toStringList(j?.columnOrder);
    const effectiveGlobal = buildEffectiveGlobalOrder(globalOrderInput, userOrder);

    // ✅ grid-settings에 있는 6차~15차연장 같은 컬럼을 availableColumns에도 반영
    setAvailableColumns(effectiveGlobal);

    _setColumnOrder(mergeUserOrderWithGlobal(userOrder, effectiveGlobal));
    _setColWidthUnitByKey(sanitizeWidths(j?.colWidthUnitByKey, effectiveGlobal, userOrder));
  }

  async function saveNow(cfg: ColumnConfig) {
    await fetch("/api/unified-grid-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
  }

  async function reloadAllColumnState() {
    const loadedGlobal = (await loadAvailableColumns()) ?? availableColumns;
    await loadUserConfig(loadedGlobal);

    const effectiveGlobal = buildEffectiveGlobalOrder(loadedGlobal, columnOrder);

    // 전역 컬럼 변경 시, 현재 state도 전역 기준으로 누락 없이 보정
    _setColumnOrder((prev) => mergeUserOrderWithGlobal(prev, effectiveGlobal));
    _setColWidthUnitByKey((prev) => sanitizeWidths(prev, effectiveGlobal, columnOrder));
  }

  // 최초 로드
  useEffect(() => {
    (async () => {
      const loadedGlobal = (await loadAvailableColumns()) ?? availableColumns;
      await loadUserConfig(loadedGlobal);

      const effectiveGlobal = buildEffectiveGlobalOrder(loadedGlobal, columnOrder);

      // 안전 보정
      _setColumnOrder((prev) => mergeUserOrderWithGlobal(prev, effectiveGlobal));
      _setColWidthUnitByKey((prev) => sanitizeWidths(prev, effectiveGlobal, columnOrder));

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
      const now = Date.now();

      // 1) 방금 조작 중이면 덮어쓰기 방지
      const idleMs = now - lastLocalChangeAtRef.current;
      if (idleMs < 1200) return;

      // 2) ✅ 스로틀: unified:update(셀 편집)로 인한 재로드 폭주 방지
      if (now - lastRemoteReloadAtRef.current < REMOTE_RELOAD_MIN_INTERVAL_MS) return;

      // 3) ✅ 사용자가 현재 input/textarea 편집 중이면 재로드 금지(입력 튕김 방지)
      const el =
        typeof document !== "undefined"
          ? (document.activeElement as HTMLElement | null)
          : null;

      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;

      lastRemoteReloadAtRef.current = now;
      void reloadAllColumnState();
    });

    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableColumns, columnOrder]);

  return {
    availableColumns,
    columnOrder,
    setColumnOrder,
    colWidthUnitByKey,
    setColWidthUnitByKey,
    reloadAllColumnState,
  };
}