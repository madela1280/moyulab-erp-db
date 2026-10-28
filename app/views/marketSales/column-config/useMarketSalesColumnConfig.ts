"use client";

// app/views/marketSales/column-config/useMarketSalesColumnConfig.ts
//
// 마켓매출 그리드의 열 순서/너비를 채널별로 DB(/api/market-sales/grid-settings)에 저장한다.
// 브라우저 저장소는 쓰지 않는다(CLAUDE.md 금지 규칙).

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_MARKET_SALES_COLUMNS,
  type MarketSalesColumn,
} from "@/views/marketSales/components/MarketSalesGrid";
import type { MarketSalesChannel } from "@/views/marketSales/types";

function applySavedConfig(
  columnOrder: string[],
  widthByKey: Record<string, number>
): MarketSalesColumn[] {
  const byKey = new Map<string, MarketSalesColumn>(
    DEFAULT_MARKET_SALES_COLUMNS.map((c) => [c.key as string, c])
  );

  const orderedKeys = columnOrder.length
    ? [
        ...columnOrder.filter((k) => byKey.has(k)),
        ...DEFAULT_MARKET_SALES_COLUMNS.map((c) => c.key).filter((k) => !columnOrder.includes(k)),
      ]
    : DEFAULT_MARKET_SALES_COLUMNS.map((c) => c.key);

  return orderedKeys.map((key) => {
    const base = byKey.get(key as string)!;
    const savedWidth = widthByKey[key as string];
    return savedWidth ? { ...base, width: savedWidth } : base;
  });
}

export function useMarketSalesColumnConfig(channel: MarketSalesChannel) {
  const [columns, setColumnsState] = useState<MarketSalesColumn[]>(DEFAULT_MARKET_SALES_COLUMNS);

  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setColumns(next: MarketSalesColumn[]) {
    setColumnsState(next);
  }

  useEffect(() => {
    hydratedRef.current = false;
    (async () => {
      try {
        const r = await fetch(`/api/market-sales/grid-settings?channel=${encodeURIComponent(channel)}`, {
          cache: "no-store",
        });
        if (r.ok) {
          const j = await r.json().catch(() => null);
          const columnOrder: string[] = Array.isArray(j?.columnOrder) ? j.columnOrder : [];
          const widthByKey: Record<string, number> =
            j?.widthByKey && typeof j.widthByKey === "object" ? j.widthByKey : {};

          setColumnsState(
            columnOrder.length || Object.keys(widthByKey).length
              ? applySavedConfig(columnOrder, widthByKey)
              : DEFAULT_MARKET_SALES_COLUMNS
          );
        }
      } catch {
        setColumnsState(DEFAULT_MARKET_SALES_COLUMNS);
      } finally {
        hydratedRef.current = true;
      }
    })();
  }, [channel]);

  useEffect(() => {
    if (!hydratedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const columnOrder = columns.map((c) => c.key);
      const widthByKey: Record<string, number> = {};
      for (const c of columns) widthByKey[c.key] = c.width;

      void fetch("/api/market-sales/grid-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, columnOrder, widthByKey }),
      }).catch(() => {});
    }, 450);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [columns, channel]);

  return { columns, setColumns };
}
