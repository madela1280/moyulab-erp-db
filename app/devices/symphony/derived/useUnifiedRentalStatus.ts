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

function parseYmdToDate(ymd: string) {
  if (!ymd) return null;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;

  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;

  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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

    // ✅ 우선순위: 미회수 > 회수중 > 대여중
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

      const requested = t(row?.data?.["반납요청일"]);
      const returned = t(row?.data?.["반납완료일"]);

      // 반납완료가 있으면 대여 상태 집계 제외
      if (returned) continue;

      const endYmd = toYmd(row?.data?.["종료일"]);
      const endDate = parseYmdToDate(endYmd);

      // ✅ 판정 규칙(요청 기준)
      // - 반납요청일/반납완료일 공란 + 종료일이 오늘 이전 => 미회수
      // - 반납완료일 공란 + 반납요청일 값 있음 => 회수중
      // - 그 외 => 대여중
      const isRequestedBlank = requested === "";
      const isReturnedBlank = returned === "";
      const isEndPast = !!endDate && endDate.getTime() < today.getTime();

      let status: "대여중" | "회수중" | "미회수" = "대여중";
      if (isRequestedBlank && isReturnedBlank && isEndPast) {
        status = "미회수";
      } else if (!isRequestedBlank && isReturnedBlank) {
        status = "회수중";
      }

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