"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { syncListen } from "@/global-sync/sync-engine";
import { calcUnifiedStatus } from "@/unified/status/calcUnifiedStatus";

type UnifiedRow = { id: number; data: Record<string, any> };

function t(v: any) {
  return String(v ?? "").trim();
}

function deviceKey(v: any) {
  return t(v).toLowerCase();
}

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

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

  const { rentingDeviceNoSet, rentingInfoByDeviceNo, statusByDeviceNo } = useMemo(() => {
    const set = new Set<string>();
    const map: Record<string, { 거래처분류: string; 수취인명: string }> = {};
    const statusMap: Record<string, "대여중" | "회수중" | "미회수"> = {};

    const rank: Record<"대여중" | "회수중" | "미회수", number> = {
      대여중: 1,
      회수중: 2,
      미회수: 3,
    };

    const today = startOfToday();

    for (const row of rows) {
      const deviceNo = t(row?.data?.["기기번호"]);
      const deviceNoKey = deviceKey(row?.data?.["기기번호"]);
      if (!deviceNo) continue;

      const unifiedStatus = calcUnifiedStatus(
        {
          수취인명: row?.data?.["수취인명"],
          연락처1: row?.data?.["연락처1"],
          계약자주소: row?.data?.["계약자주소"],
          택배발송일: row?.data?.["택배발송일"],
          시작일: row?.data?.["시작일"],
          종료일: row?.data?.["종료일"],
          반납요청일: row?.data?.["반납요청일"],
          반납완료일: row?.data?.["반납완료일"],
        },
        today
      ).status;

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

    return {
      rentingDeviceNoSet: set,
      rentingInfoByDeviceNo: map,
      statusByDeviceNo: statusMap,
    };
  }, [rows]);

  return { rentingDeviceNoSet, rentingInfoByDeviceNo, statusByDeviceNo, loading };
}