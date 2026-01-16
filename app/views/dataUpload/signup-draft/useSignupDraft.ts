"use client";

import { useEffect, useRef, useState } from "react";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
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

  // 최신 rows를 항상 들고 있어, beforeunload/언마운트에서 flush 저장 가능
  const latestRowsRef = useRef<RowValues[]>([]);
  useEffect(() => {
    latestRowsRef.current = rowsState;
  }, [rowsState]);

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flushSave(reason: "debounce" | "unmount" | "beforeunload") {
    if (!hydratedRef.current) return;
    if (!touchedRef.current) return;

    const snapshot = latestRowsRef.current;

    // 저장 중이면 최신 스냅샷을 큐에 넣고 종료(저장 완료 후 1회 더 저장됨)
    if (inflightRef.current) {
      queuedRef.current = snapshot;
      return;
    }

    inflightRef.current = true;
    try {
      await apiPatchSignupDraft(snapshot);

      // 다른 탭/화면에 변경 알림(코어 수정 없이 호출만)
      syncEmitUnifiedUpdate();
    } catch (e: any) {
      // beforeunload에서는 사용자 방해 최소화
      if (reason !== "beforeunload") onError?.(e?.message || "임시저장에 실패했습니다.");
    } finally {
      inflightRef.current = false;

      // 저장 중 추가 변경이 쌓였으면 1회 더 저장
      if (queuedRef.current) {
        const next = queuedRef.current;
        queuedRef.current = null;

        inflightRef.current = true;
        try {
          await apiPatchSignupDraft(next);
          syncEmitUnifiedUpdate();
        } catch (e: any) {
          if (reason !== "beforeunload") onError?.(e?.message || "임시저장에 실패했습니다.");
        } finally {
          inflightRef.current = false;
        }
      }
    }
  }

  // 디바운스 자동저장: "사용자 수정(touched)" 이후에만 저장
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!touchedRef.current) return;

    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      void flushSave("debounce");
    }, 600);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsState]);

  // 페이지 이탈/탭 닫힘 시에도 저장을 시도(타이머 미실행으로 유실되는 케이스 방지)
  useEffect(() => {
    const onBeforeUnload = () => {
      // 브라우저 제한 때문에 await는 못하지만, 최대한 저장 트리거
      void flushSave("beforeunload");
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      void flushSave("unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부(그리드)에서 호출하는 setter: 이때만 touched=true
  function setRows(next: RowValues[]) {
    touchedRef.current = true;
    setRowsState(Array.isArray(next) ? next : []);
  }

  async function clear() {
    try {
      await apiDeleteSignupDraft();
      setRowsState([]);
      touchedRef.current = false;

      // 삭제도 다른 탭에 알림
      syncEmitUnifiedUpdate();
    } catch (e: any) {
      onError?.(e?.message || "임시저장 삭제에 실패했습니다.");
    }
  }

  // 다른 탭에서 unified.update를 받으면 외부에서 reload 호출 가능하도록 제공
  async function reload() {
    try {
      const j = await apiGetSignupDraft();
      const restored = Array.isArray(j?.rows) ? j.rows : [];
      setRowsState(restored);

      // reload는 사용자 수정이 아님
      touchedRef.current = false;
    } catch (e: any) {
      onError?.(e?.message || "임시저장 불러오기에 실패했습니다.");
    }
  }

  return { rows: rowsState, setRows, loading, clear, reload };
}