"use client";

import { useEffect, useRef, useState } from "react";
import { apiDeleteSignupDraft, apiGetSignupDraft, apiPatchSignupDraft } from "@/views/dataUpload/signup-draft/serviceSignupDraft";

type RowValues = Record<string, string>;

export function useSignupDraft({ onError }: { onError?: (msg: string) => void } = {}) {
  const [rowsState, setRowsState] = useState<RowValues[]>([]);
  const [loading, setLoading] = useState(true);

  // 최초 로드 완료(복원 완료) 여부
  const hydratedRef = useRef(false);

  // 사용자가 실제로 수정했는지(초기 로드/복원으로 인한 저장 덮어쓰기 방지)
  const touchedRef = useRef(false);

  // 디바운스/동시요청 제어
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

        const restored = Array.isArray(j?.rows) ? j.rows : [];
        setRowsState(restored);

        // 복원은 "사용자 수정"이 아님
        touchedRef.current = false;
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

  // 디바운스 자동저장: "사용자 수정(touched)" 이후에만 저장
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!touchedRef.current) return;

    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(async () => {
      if (inflightRef.current) {
        queuedRef.current = rowsState;
        return;
      }

      inflightRef.current = true;
      try {
        await apiPatchSignupDraft(rowsState);
      } catch (e: any) {
        onError?.(e?.message || "임시저장에 실패했습니다.");
      } finally {
        inflightRef.current = false;

        if (queuedRef.current) {
          const next = queuedRef.current;
          queuedRef.current = null;

          inflightRef.current = true;
          try {
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
  }, [rowsState]);

  // 외부(그리드)에서 호출하는 setter: 이때만 touched=true
  function setRows(next: RowValues[]) {
    touchedRef.current = true;
    setRowsState(Array.isArray(next) ? next : []);
  }

  async function clear() {
    try {
      await apiDeleteSignupDraft();
      // 삭제 후 상태도 초기화
      setRowsState([]);
      touchedRef.current = false;
    } catch (e: any) {
      onError?.(e?.message || "임시저장 삭제에 실패했습니다.");
    }
  }

  return { rows: rowsState, setRows, loading, clear };
}