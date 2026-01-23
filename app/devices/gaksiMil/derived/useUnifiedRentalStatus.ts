"use client";

import { useEffect, useMemo, useState } from "react";
import { syncListen } from "@/global-sync/sync-engine";

type UnifiedRow = { id: number; data: Record<string, any> };

function t(v: any) {
  return String(v ?? "").trim();
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

  async function fetchUnified(options?: { silent?: boolean }) {
    const silent = !!options?.silent;

    if (!silent) setLoading(true);
    try {
      const r = await fetch("/api/unified", { cache: "no-store" });
      const j = (await r.json()) as UnifiedRow[];
      setRows(Array.isArray(j) ? j : []);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await fetchUnified({ silent: false });
    })();
  }, []);

  // ✅ 통합관리 변경(unified:update) 수신 시 파생데이터도 즉시 재조회하여 갱신
  useEffect(() => {
    const off = syncListen(() => {
      void fetchUnified({ silent: true });
    });
    return off;
  }, []);

  const { rentingDeviceNoSet, rentingInfoByDeviceNo } = useMemo(() => {
    const set = new Set<string>();
    const map: Record<string, { 거래처분류: string; 수취인명: string }> = {};

    for (const row of rows) {
      const deviceNo = t(row?.data?.["기기번호"]);
      if (!deviceNo) continue;

      const returned = t(row?.data?.["반납완료일"]);
      if (returned) continue; // 반납완료면 제외

      set.add(deviceNo);

      map[deviceNo] = {
        거래처분류: t(row?.data?.["거래처분류"]),
        수취인명: t(row?.data?.["수취인명"]),
      };
    }

    return { rentingDeviceNoSet: set, rentingInfoByDeviceNo: map };
  }, [rows]);

  return { rentingDeviceNoSet, rentingInfoByDeviceNo, loading };
}