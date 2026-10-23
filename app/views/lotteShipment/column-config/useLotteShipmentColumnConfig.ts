"use client";

// app/views/lotteShipment/column-config/useLotteShipmentColumnConfig.ts
//
// 롯데택배 그리드의 열 순서/너비를 DB(/api/lotte-shipment/grid-settings)에 저장해서,
// 통합관리 그리드와 동일하게 "한 번 조정하면 다시 조정할 필요 없게" 만드는 훅.
// 브라우저 저장소(localStorage 등)는 쓰지 않는다(CLAUDE.md 금지 규칙) — 항상 DB에 저장.

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_LOTTE_SHIPMENT_COLUMNS,
  type LotteShipmentColumn,
} from "@/views/lotteShipment/components/LotteShipmentGrid";

function applySavedConfig(
  columnOrder: string[],
  widthByKey: Record<string, number>
): LotteShipmentColumn[] {
  const byKey = new Map<string, LotteShipmentColumn>(
    DEFAULT_LOTTE_SHIPMENT_COLUMNS.map((c) => [c.key as string, c])
  );

  const orderedKeys = columnOrder.length
    ? [
        ...columnOrder.filter((k) => byKey.has(k)),
        ...DEFAULT_LOTTE_SHIPMENT_COLUMNS.map((c) => c.key).filter(
          (k) => !columnOrder.includes(k)
        ),
      ]
    : DEFAULT_LOTTE_SHIPMENT_COLUMNS.map((c) => c.key);

  return orderedKeys.map((key) => {
    const base = byKey.get(key as string)!;
    const savedWidth = widthByKey[key as string];
    return savedWidth ? { ...base, width: savedWidth } : base;
  });
}

export function useLotteShipmentColumnConfig() {
  const [columns, setColumnsState] = useState<LotteShipmentColumn[]>(
    DEFAULT_LOTTE_SHIPMENT_COLUMNS
  );

  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setColumns(next: LotteShipmentColumn[]) {
    setColumnsState(next);
  }

  // 최초 로드
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/lotte-shipment/grid-settings", { cache: "no-store" });
        if (r.ok) {
          const j = await r.json().catch(() => null);
          const columnOrder: string[] = Array.isArray(j?.columnOrder) ? j.columnOrder : [];
          const widthByKey: Record<string, number> =
            j?.widthByKey && typeof j.widthByKey === "object" ? j.widthByKey : {};

          if (columnOrder.length || Object.keys(widthByKey).length) {
            setColumnsState(applySavedConfig(columnOrder, widthByKey));
          }
        }
      } catch {
        // 조회 실패 시 기본값 유지
      } finally {
        hydratedRef.current = true;
      }
    })();
  }, []);

  // 변경 시 디바운스 저장
  useEffect(() => {
    if (!hydratedRef.current) return; // 최초 로드 전 기본값으로는 저장하지 않음(덮어쓰기 방지)

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const columnOrder = columns.map((c) => c.key);
      const widthByKey: Record<string, number> = {};
      for (const c of columns) widthByKey[c.key] = c.width;

      void fetch("/api/lotte-shipment/grid-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnOrder, widthByKey }),
      }).catch(() => {});
    }, 450);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    };
  }, [columns]);

  return { columns, setColumns };
}
