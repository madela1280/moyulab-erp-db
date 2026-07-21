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
    // timer(in-debounce) + inflight + queued 모두 완전히 비울 때까지 대기
    for (let i = 0; i < 30; i++) {
      const hasTimer = timerRef.current != null;
      const hasInflight = inflightRef.current;
      const hasQueued = queuedRef.current !== null;

      if (!hasTimer && !hasInflight && !hasQueued) return;

      // 디바운스 대기중이면 즉시 flush해서 "지웠다가 다시 나타남" 레이스 차단
      if (hasTimer && !hasInflight) {
        const t = timerRef.current;
        if (t != null) {
          window.clearTimeout(t);
          timerRef.current = null;
        }
        await flushSave("debounce");
        continue;
      }

      if (hasInflight) {
        const p = inflightPromiseRef.current;
        if (p) await p;
      }

      await new Promise((r) => setTimeout(r, 0));
    }

    throw new Error("DRAFT_SAVE_INFLIGHT");
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
      // 1) 대기중인 디바운스/큐 먼저 정리(이전 스냅샷 재저장 방지)
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      queuedRef.current = null;

      // 2) 저장 중이면 완전 종료까지 대기
      if (inflightRef.current) {
        await waitForIdle();
      }

      // 3) 로컬 상태를 먼저 "삭제 의도"로 확정
      setRowsState([]);
      latestRowsRef.current = [];
      touchedRef.current = false;

      // 4) 서버 draft 삭제
      await apiDeleteSignupDraft();

      // 삭제도 알림(폭주 방지 스로틀)
      emitUnifiedUpdateThrottled();
    } catch (e: any) {
      onError?.(e?.message || "임시저장 삭제에 실패했습니다.");
    }
  }

  async function reload() {
    try {
      // ✅ 저장 대기(timer) / 저장중(inflight) / 큐(queued) 상태면 먼저 안정화
      const hasPendingLocalSave =
        timerRef.current != null || inflightRef.current || queuedRef.current !== null;

      if (hasPendingLocalSave) {
        await waitForIdle();
      }

      const j = await apiGetSignupDraft();
      const restored = Array.isArray(j?.rows) ? j.rows : [];

      // reload는 사용자 수정이 아님
      setRowsState(restored);
      latestRowsRef.current = restored;
      touchedRef.current = false;
    } catch (e: any) {
      if (String(e?.message || "") !== "DRAFT_SAVE_INFLIGHT") {
        onError?.(e?.message || "임시저장 불러오기에 실패했습니다.");
      }
    }
  }

  return { rows: rowsState, setRows, loading, clear, reload };
}