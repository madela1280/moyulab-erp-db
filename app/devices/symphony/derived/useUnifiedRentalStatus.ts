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

function toYmd(v: any) {
  const s = t(v);
  if (!s) return "";

  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }

  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) {
    const y = m[1];
    const mo = String(m[2]).padStart(2, "0");
    const d = String(m[3]).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  return "";
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

    const { rentingDeviceNoSet, rentingInfoByDeviceNo, statusByDeviceNo } = useMemo(() => {
    const set = new Set<string>();
    const map: Record<string, { 거래처분류: string; 수취인명: string }> = {};
    const statusMap: Record<string, "대여중" | "회수중" | "미회수"> = {};

    const rank: Record<"대여중" | "회수중" | "미회수", number> = {
      대여중: 1,
      미회수: 2,
      회수중: 3,
    };

    const today = todayYmd();

    for (const row of rows) {
      const deviceNo = t(row?.data?.["기기번호"]);
      const deviceNoKey = deviceKey(row?.data?.["기기번호"]);
      if (!deviceNo) continue;

      const returned = t(row?.data?.["반납완료일"]);
      if (returned) continue; // 반납완료면 제외

      const requested = t(row?.data?.["반납요청일"]);
      const end = toYmd(row?.data?.["종료일"]);

      let status: "대여중" | "회수중" | "미회수" = "대여중";
      if (requested) status = "회수중";
      else if (end && end === today) status = "미회수";

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