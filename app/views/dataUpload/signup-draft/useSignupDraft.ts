"use client";

import { useEffect, useRef, useState } from "react";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
import { apiDeleteSignupDraft, apiGetSignupDraft, apiPatchSignupDraft } from "@/views/dataUpload/signup-draft/serviceSignupDraft";

type RowValues = Record<string, string>;

type PatchResponse = {
  id: number | null;
  rows: RowValues[];
  updated_at?: string | null;
  ignored_empty_patch?: boolean;
};

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

  // ✅ inflight 종료를 외부(reload 등)에서 기다릴 수 있게(리로드가 저장중 rows를 덮는 문제 방지)
  const inflightPromiseRef = useRef<Promise<void> | null>(null);
  const inflightResolveRef = useRef<(() => void) | null>(null);

  function beginInflight() {
    inflightRef.current = true;
    if (!inflightPromiseRef.current) {
      inflightPromiseRef.current = new Promise<void>((resolve) => {
        inflightResolveRef.current = resolve;
      });
    }
  }

  function endInflight() {
    inflightRef.current = false;
    const resolve = inflightResolveRef.current;
    inflightResolveRef.current = null;
    inflightPromiseRef.current = null;
    resolve?.();
  }

  async function waitForIdle() {
    // inflight + queued 저장이 모두 끝날 때까지 대기
    // (queued는 inflight 종료 직후 곧바로 2번째 저장이 시작될 수 있어 루프로 처리)
    for (let i = 0; i < 20; i++) {
      if (!inflightRef.current) return;
      const p = inflightPromiseRef.current;
      if (p) await p;
      // 다음 tick에서 상태 재확인
      await new Promise((r) => setTimeout(r, 0));
    }

    // 너무 오래 걸리면(네트워크/서버 이슈) 무한대기 방지
    // 그래도 최대한 안전하게: inflight가 계속이면 여기서 그냥 종료하고 reload는 진행하지 않게 한다.
    if (inflightRef.current) throw new Error("DRAFT_SAVE_INFLIGHT");
  }

  // 최신 rows 스냅샷(언마운트/이탈 flush 저장용)
  const latestRowsRef = useRef<RowValues[]>([]);
  useEffect(() => {
    latestRowsRef.current = rowsState;
  }, [rowsState]);

  // unified:update emit 폭주 방지(점멸/리로드 폭주 방지)
  const lastEmitAtRef = useRef(0);
  const emitTimerRef = useRef<number | null>(null);
  const EMIT_THROTTLE_MS = 1200;

  function emitUnifiedUpdateThrottled() {
    if (typeof window === "undefined") return;

    const now = Date.now();
    const elapsed = now - lastEmitAtRef.current;

    if (elapsed >= EMIT_THROTTLE_MS) {
      lastEmitAtRef.current = now;
      syncEmitUnifiedUpdate();
      return;
    }

    if (emitTimerRef.current) return;

    const wait = Math.max(50, EMIT_THROTTLE_MS - elapsed);
    emitTimerRef.current = window.setTimeout(() => {
      emitTimerRef.current = null;
      lastEmitAtRef.current = Date.now();
      syncEmitUnifiedUpdate();
    }, wait);
  }

  // 최초 로드(복원) - 사용자가 이미 입력(touched)했으면 복원 응답으로 덮어쓰지 않음
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        const j = await apiGetSignupDraft();
        if (!mounted) return;

        const restored = Array.isArray(j?.rows) ? j.rows : [];

        // ✅ 사용자가 이미 수정했다면(=touched) 늦게 도착한 복원 응답이 입력값을 덮지 못하게 방지
        if (!touchedRef.current) {
          setRowsState(restored);
          latestRowsRef.current = restored;

          // 복원은 "사용자 수정"이 아님
          touchedRef.current = false;
        }

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

    beginInflight();
    try {
      const resp = (await apiPatchSignupDraft(snapshot, { allowEmptyOverwrite: true })) as PatchResponse;

      // 서버가 "빈 PATCH 무시"를 했다면 서버 rows로 복원해서 빈값 고착 방지
      if (resp?.ignored_empty_patch) {
        const serverRows = Array.isArray(resp?.rows) ? resp.rows : [];
        setRowsState(serverRows);
        latestRowsRef.current = serverRows;
        touchedRef.current = false;
      }

      // ✅ 다른 탭/화면에 변경 알림(폭주 방지 스로틀)
      emitUnifiedUpdateThrottled();
    } catch (e: any) {
      if (reason !== "beforeunload") onError?.(e?.message || "임시저장에 실패했습니다.");
    } finally {
      endInflight();

      // 저장 중 추가 변경이 쌓였으면 1회 더 저장
      if (queuedRef.current) {
        const next = queuedRef.current;
        queuedRef.current = null;

        // 두 번째 저장도 inflight로 처리
        beginInflight();
        try {
         const resp2 = (await apiPatchSignupDraft(next, { allowEmptyOverwrite: true })) as PatchResponse;

          if (resp2?.ignored_empty_patch) {
            const serverRows2 = Array.isArray(resp2?.rows) ? resp2.rows : [];
            setRowsState(serverRows2);
            latestRowsRef.current = serverRows2;
            touchedRef.current = false;
          }

          emitUnifiedUpdateThrottled();
        } catch (e: any) {
          if (reason !== "beforeunload") onError?.(e?.message || "임시저장에 실패했습니다.");
        } finally {
          endInflight();
        }
      }
    }
  }

  // 디바운스 자동저장: 사용자 수정(touched) 이후에만 저장
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!touchedRef.current) return;

    if (timerRef.current) window.clearTimeout(timerRef.current);

    timerRef.current = window.setTimeout(() => {
      void flushSave("debounce");
    }, 600);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsState]);

  // 페이지 이탈/탭 닫힘 시에도 저장 시도
  useEffect(() => {
    const onBeforeUnload = () => {
      void flushSave("beforeunload");
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (emitTimerRef.current) window.clearTimeout(emitTimerRef.current);
      void flushSave("unmount");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 외부(그리드)에서 호출하는 setter: 이때만 touched=true
  function setRows(next: RowValues[]) {
    const safe = Array.isArray(next) ? next : [];

    // ✅ 언마운트/이탈 flushSave가 최신값을 보게 즉시 ref 갱신
    latestRowsRef.current = safe;

    touchedRef.current = true;
    setRowsState(safe);
  }

  async function clear() {
    try {
      // 저장 중이면 먼저 안정화(레이스 방지)
      if (inflightRef.current) {
        await waitForIdle();
      }

      await apiDeleteSignupDraft();
      setRowsState([]);
      latestRowsRef.current = [];
      touchedRef.current = false;

      // 삭제도 알림(폭주 방지 스로틀)
      emitUnifiedUpdateThrottled();
    } catch (e: any) {
      onError?.(e?.message || "임시저장 삭제에 실패했습니다.");
    }
  }

  async function reload() {
    try {
      // ✅ 저장 중에 reload가 들어오면, 저장 완료 후에만 reload 수행(덮어쓰기/점멸 방지)
      if (inflightRef.current) {
        await waitForIdle();
      }

      const j = await apiGetSignupDraft();
      const restored = Array.isArray(j?.rows) ? j.rows : [];

      // reload는 사용자 수정이 아님
      setRowsState(restored);
      latestRowsRef.current = restored;
      touchedRef.current = false;
    } catch (e: any) {
      // waitForIdle 타임아웃 같은 내부 에러는 사용자에게 과도 노출하지 않음
      if (String(e?.message || "") !== "DRAFT_SAVE_INFLIGHT") {
        onError?.(e?.message || "임시저장 불러오기에 실패했습니다.");
      }
    }
  }

  return { rows: rowsState, setRows, loading, clear, reload };
}