"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  gaksiMilColumns,
} from "@/devices/gaksiMil/columns/gaksiMilColumns";

type ColumnConfig = {
  columnOrder: string[];
  colWidthUnitByKey: Record<string, number>;
};

function clampUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

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
    for (let j = i - 1; j >= 0; j--) {
      const prev = globalOrder[j];
      const idx = result.indexOf(prev);
      if (idx >= 0) {
        result.splice(idx + 1, 0, k);
        inserted = true;
        break;
      }
    }

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

    if (!inserted) result.push(k);

    rSet.add(k);
  }

  return result;
}

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

  for (const k of gaksiMilColumns as unknown as string[]) {
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

export function useGaksiMilColumnConfig() {
  const defaultGlobal = [...(gaksiMilColumns as unknown as string[])];

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

  async function loadAvailableColumns() {
    const r = await fetch("/api/devices/gaksiMil/columns", { cache: "no-store" });
    if (!r.ok) return availableColumns;

    const j = await r.json().catch(() => ({} as any));
    const order = Array.isArray(j?.order) ? j.order.map(String) : [];

    const safe = order.length ? order : defaultGlobal;
    setAvailableColumns(safe);
    return safe;
  }

  async function loadUserConfig(globalOrder: string[]) {
    const r = await fetch("/api/devices/gaksiMil/grid-settings", { cache: "no-store" });
    if (!r.ok) return;

    const j = (await r.json().catch(() => ({}))) as Partial<ColumnConfig>;
    const merged = mergeUserOrderWithGlobal(j.columnOrder, globalOrder);
    _setColumnOrder(enforceFixedDerivedColumns(merged));
    _setColWidthUnitByKey(sanitizeWidths(j.colWidthUnitByKey, globalOrder));
  }

  async function saveNow(cfg: ColumnConfig) {
    await fetch("/api/devices/gaksiMil/grid-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
  }

  async function reloadAllColumnState() {
    const globalOrder = await loadAvailableColumns();
    await loadUserConfig(globalOrder);

    _setColumnOrder((prev) =>
      enforceFixedDerivedColumns(mergeUserOrderWithGlobal(prev, globalOrder))
    );
    _setColWidthUnitByKey((prev) => sanitizeWidths(prev, globalOrder));
  }

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