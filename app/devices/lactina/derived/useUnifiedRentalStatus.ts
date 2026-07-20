"use client";

import { useEffect, useMemo, useState } from "react";
import { syncListen } from "@/global-sync/sync-engine";
import { calcUnifiedStatus } from "@/unified/status/calcUnifiedStatus";

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

 const { rentingDeviceNoSet, rentingInfoByDeviceNo, statusByDeviceNo } = useMemo(() => {
    const set = new Set<string>();
    const map: Record<string, { 거래처분류: string; 수취인명: string }> = {};
    const statusMap: Record<string, "대여중" | "회수중" | "미회수"> = {};

    const rank: Record<"대여중" | "회수중" | "미회수", number> = {
      대여중: 1,
      회수중: 2,
      미회수: 3,
    };

    for (const row of rows) {
      const deviceNo = t(row?.data?.["기기번호"]);
      const deviceNoKey = deviceKey(row?.data?.["기기번호"]);
      if (!deviceNo) continue;

      const unifiedStatus = calcUnifiedStatus({
        수취인명: row?.data?.["수취인명"],
        연락처1: row?.data?.["연락처1"],
        계약자주소: row?.data?.["계약자주소"],
        택배발송일: row?.data?.["택배발송일"],
        시작일: row?.data?.["시작일"],
        종료일: row?.data?.["종료일"],
        반납요청일: row?.data?.["반납요청일"],
        반납완료일: row?.data?.["반납완료일"],
      }).status;

      let status: "대여중" | "회수중" | "미회수" | "" = "";

      if (unifiedStatus === "회수중") {
        status = "회수중";
      } else if (unifiedStatus === "만기지남") {
        status = "미회수";
      } else if (
        unifiedStatus === "대여중" ||
        unifiedStatus === "만기5일전" ||
        unifiedStatus === "만기4일전" ||
        unifiedStatus === "만기3일전" ||
        unifiedStatus === "만기2일전" ||
        unifiedStatus === "만기1일전" ||
        unifiedStatus === "오늘만기"
      ) {
        status = "대여중";
      }

      if (!status) continue;

      set.add(deviceNo);
      if (deviceNoKey) set.add(deviceNoKey);

      const info = {
        거래처분류: t(row?.data?.["거래처분류"]),
        수취인명: t(row?.data?.["수취인명"]),
      };
      map[deviceNo] = info;
      if (deviceNoKey) map[deviceNoKey] = info;

      const prevA = statusMap[deviceNo];
      if (!prevA || rank[status] >= rank[prevA]) statusMap[deviceNo] = status;

      if (deviceNoKey) {
        const prevB = statusMap[deviceNoKey];
        if (!prevB || rank[status] >= rank[prevB]) statusMap[deviceNoKey] = status;
      }
    }

    return { rentingDeviceNoSet: set, rentingInfoByDeviceNo: map, statusByDeviceNo: statusMap };
  }, [rows]);

  return { rentingDeviceNoSet, rentingInfoByDeviceNo, statusByDeviceNo, loading };
} 