// app/devices/symphony/derived/useUnifiedRentalStatus.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncListen } from "@/global-sync/sync-engine";

type UnifiedRow = { id: number; data: Record<string, any> };

function t(v: any) {
  return String(v ?? "").trim();
}

function deviceKey(v: any) {
  return t(v).toLowerCase();
}

/**
 * 통합관리(unified)에서 “기기번호”로 매칭해서,
 * 반납완료일이 비어있는(=대여중) 항목의 파생정보를 만든다.
 *
 * 반환:
 * - rentingDeviceNoSet: 대여중인 기기번호 Set
 * - rentingInfoByDeviceNo: { [기기번호]: { 거래처분류, 수취인명 } }
 */
export function useUnifiedRentalStatus() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(true);

    const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchUnified(options?: { silent?: boolean }) {
    const silent = !!options?.silent;

    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }

    inFlightRef.current = true;
    if (!silent) setLoading(true);

    try {
      const r = await fetch("/api/unified", { cache: "no-store" });
      const j = (await r.json()) as UnifiedRow[];
      setRows(Array.isArray(j) ? j : []);
    } finally {
      if (!silent) setLoading(false);
      inFlightRef.current = false;

      if (queuedRef.current) {
        queuedRef.current = false;
        void fetchUnified({ silent: true });
      }
    }
  }

  useEffect(() => {
    void fetchUnified({ silent: false });
  }, []);

  // ✅ unified:update 버스트를 짧게 coalesce해서 즉시성 + 안정성 동시 확보
  useEffect(() => {
    const off = syncListen(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void fetchUnified({ silent: true });
      }, 120);
    });

    return () => {
      off();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

    const { rentingDeviceNoSet, rentingInfoByDeviceNo } = useMemo(() => {
    const set = new Set<string>();
    const map: Record<string, { 거래처분류: string; 수취인명: string }> = {};

    for (const row of rows) {
      const deviceNo = t(row?.data?.["기기번호"]);
      const deviceNoKey = deviceKey(row?.data?.["기기번호"]);
      if (!deviceNo) continue;

      const returned = t(row?.data?.["반납완료일"]);
      if (returned) continue; // 반납완료면 제외

      // 대여중 (원본 + 소문자 키 둘 다 저장해서 대소문자 불일치에도 즉시 매칭)
      set.add(deviceNo);
      if (deviceNoKey) set.add(deviceNoKey);

      // 표시용 파생값(없으면 빈문자)
      const info = {
        거래처분류: t(row?.data?.["거래처분류"]),
        수취인명: t(row?.data?.["수취인명"]),
      };
      map[deviceNo] = info;
      if (deviceNoKey) map[deviceNoKey] = info;
    }

    return { rentingDeviceNoSet: set, rentingInfoByDeviceNo: map };
  }, [rows]);

  return { rentingDeviceNoSet, rentingInfoByDeviceNo, loading };
}