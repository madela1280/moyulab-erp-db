"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  swingMaxiColumns,
} from "@/devices/swingMaxi/columns/swingMaxiColumns";

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

/**
 * ✅ 강제 위치 고정(요구사항 공통)
 * - "거래처", "대여자명"은 항상
 *   "유축기 위치" 바로 뒤, "폐기" 바로 앞(= 유축기 위치와 폐기 사이)에 위치해야 한다.
 */
function enforceFixedDerivedColumns(order: string[]) {
  const FIXED = ["거래처", "대여자명"] as const;
  const FIXED_SET = new Set<string>(FIXED);

  const presentFixed = FIXED.filter((k) => order.includes(k));
  if (!presentFixed.length) return order;

  const cleaned = order.filter((k) => !FIXED_SET.has(k));

  const idxPump = cleaned.indexOf("유축기 위치");
  if (idxPump >= 0) {
    cleaned.splice(idxPump + 1, 0, ...presentFixed);
    return cleaned;
  }

  const idxDispose = cleaned.indexOf("폐기");
  if (idxDispose >= 0) {
    cleaned.splice(idxDispose, 0, ...presentFixed);
    return cleaned;
  }

  return [...cleaned, ...presentFixed];
}

function sanitizeWidths(input: any, globalOrder: string[]) {
  const base: Record<string, number> = {};

  // 기본컬럼은 기본값(20) 세팅
  for (const k of swingMaxiColumns as unknown as string[]) {
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

export function useSwingMaxiColumnConfig() {
  const defaultGlobal = [...(swingMaxiColumns as unknown as string[])];

  const [availableColumns, setAvailableColumns] = useState<string[]>(defaultGlobal);

  const [columnOrder, _setColumnOrder] = useState<string[]>(defaultGlobal);

  const [colWidthUnitByKey, _setColWidthUnitByKey] = useState<Record<string, number>>({
    ...DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  });

  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setColumnOrder(next: string[]) {
    const gSet = new Set(availableColumns);
    const filtered = next.filter((k) => gSet.has(k));
    const merged = mergeUserOrderWithGlobal(filtered, availableColumns);
    _setColumnOrder(enforceFixedDerivedColumns(merged));
  }

  function setColWidthUnitByKey(next: Record<string, number>) {
    _setColWidthUnitByKey(sanitizeWidths(next, availableColumns));
  }

  // ✅ 전역 컬럼(기본+커스텀) 목록 로드: /api/devices/swingMaxi/columns
  async function loadAvailableColumns() {
    const r = await fetch("/api/devices/swingMaxi/columns", { cache: "no-store" });
    if (!r.ok) return availableColumns;

    const j = await r.json().catch(() => ({} as any));
    const order = Array.isArray(j?.order) ? j.order.map(String) : [];

    const safe = order.length ? order : defaultGlobal;
    setAvailableColumns(safe);
    return safe;
  }

  // ✅ 유저별 컬럼 설정 로드: /api/devices/swingMaxi/grid-settings
  async function loadUserConfig(globalOrder: string[]) {
    const r = await fetch("/api/devices/swingMaxi/grid-settings", { cache: "no-store" });
    if (!r.ok) return;

    const j = (await r.json().catch(() => ({}))) as Partial<ColumnConfig>;
    const merged = mergeUserOrderWithGlobal(j.columnOrder, globalOrder);
    _setColumnOrder(enforceFixedDerivedColumns(merged));
    _setColWidthUnitByKey(sanitizeWidths(j.colWidthUnitByKey, globalOrder));
  }

  async function saveNow(cfg: ColumnConfig) {
    await fetch("/api/devices/swingMaxi/grid-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
  }

  // 외부(양식추가/삭제 후)에서 호출할 “전체 재로딩”
  async function reloadAllColumnState() {
    const globalOrder = await loadAvailableColumns();
    await loadUserConfig(globalOrder);

    // 안전 보정(+ 강제 위치 규칙 포함)
    _setColumnOrder((prev) =>
      enforceFixedDerivedColumns(mergeUserOrderWithGlobal(prev, globalOrder))
    );
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

  // 변경 시 디바운스 저장(유저별 설정)
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