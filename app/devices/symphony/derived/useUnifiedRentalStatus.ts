"use client";

import { useEffect, useMemo, useState } from "react";

type UnifiedRow = { id: number; data: Record<string, any> };

function normalizeDeviceNo(v: any) {
  return String(v ?? "").trim();
}

/**
 * 통합관리(unified) 데이터에서
 * - 기기번호가 같고
 * - 반납완료일이 비어 있으면
 * => "대여중" 표시용 매핑 생성
 *
 * 1차 구현: 클라이언트에서 /api/unified 전체를 가져와 매칭(간단)
 * (데이터가 커지면 서버 파생 API로 교체)
 */
export function useUnifiedRentalStatus() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/unified", { cache: "no-store" });
        const j = (await r.json()) as UnifiedRow[];
        setRows(Array.isArray(j) ? j : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rentingDeviceNoSet = useMemo(() => {
    const set = new Set<string>();

    for (const row of rows) {
      const deviceNo = normalizeDeviceNo(row?.data?.["기기번호"]);
      if (!deviceNo) continue;

      const returned = normalizeDeviceNo(row?.data?.["반납완료일"]);
      if (!returned) {
        set.add(deviceNo);
      }
    }

    return set;
  }, [rows]);

  return { rentingDeviceNoSet, loading };
}