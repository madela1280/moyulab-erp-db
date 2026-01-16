"use client";

import { useEffect, useRef, useState } from "react";
import { apiDeleteSignupDraft, apiGetSignupDraft, apiPatchSignupDraft } from "@/views/dataUpload/signup-draft/serviceSignupDraft";

type RowValues = Record<string, string>;

export function useSignupDraft({ onError }: { onError?: (msg: string) => void } = {}) {
  const [rows, setRows] = useState<RowValues[]>([]);
  const [loading, setLoading] = useState(true);

  const hydratedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const inflightRef = useRef(false);
  const queuedRef = useRef<RowValues[] | null>(null);

  // 최초 로드(복원)
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const j = await apiGetSignupDraft();
        if (!mounted) return;
        setRows(Array.isArray(j?.rows) ? j.rows : []);
        hydratedRef.current = true;
      } catch (e: any) {
        hydratedRef.current = true;
        onError?.(e?.message || "임시저장 불러오기에 실패했습니다.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 디바운스 자동저장
  useEffect(() => {
    if (!hydratedRef.current) return;

    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(async () => {
      // 연속 변경 중이면 최신 rows만 저장
      if (inflightRef.current) {
        queuedRef.current = rows;
        return;
      }

      inflightRef.current = true;
      try {
        await apiPatchSignupDraft(rows);
      } catch (e: any) {
        onError?.(e?.message || "임시저장에 실패했습니다.");
      } finally {
        inflightRef.current = false;

        // 저장 중 추가 변경이 쌓였으면 1회 더 저장
        if (queuedRef.current) {
          const next = queuedRef.current;
          queuedRef.current = null;
          try {
            inflightRef.current = true;
            await apiPatchSignupDraft(next);
          } catch (e: any) {
            onError?.(e?.message || "임시저장에 실패했습니다.");
          } finally {
            inflightRef.current = false;
          }
        }
      }
    }, 600);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  async function clear() {
    try {
      await apiDeleteSignupDraft();
    } catch (e: any) {
      onError?.(e?.message || "임시저장 삭제에 실패했습니다.");
    }
  }

  return { rows, setRows, loading, clear };
}