"use client";

import { useCallback, useRef, useState } from "react";

export type CellDraftId = string;

export type CellDraftStore = {
  /** draft 존재 여부 */
  has: (id: CellDraftId) => boolean;

  /** draft가 있으면 draft, 없으면 fallback 반환 */
  get: (id: CellDraftId, fallback?: string) => string;

  /**
   * draft 설정
   * - notify=true: 리렌더 트리거(주의: 그리드 전체 리렌더를 유발할 수 있음)
   * - notify=false: ref만 갱신(성능용, uncontrolled input과 같이 쓰는 용도)
   */
  set: (id: CellDraftId, value: string, opts?: { notify?: boolean }) => void;

  /** draft 삭제 */
  del: (id: CellDraftId, opts?: { notify?: boolean }) => void;

  /** 전체 draft 삭제 */
  clearAll: (opts?: { notify?: boolean }) => void;

  /**
   * 필요할 때만 수동 리렌더 트리거
   * (예: blur 직후 1회, 선택 범위 삭제 직후 1회 등)
   */
  notify: () => void;

  /** 내부적으로 리렌더 카운터(디버깅/의존성용) */
  version: number;
};

function safeStr(v: unknown) {
  return String(v ?? "");
}

export function useCellDraft(): CellDraftStore {
  const draftsRef = useRef<Record<CellDraftId, string>>({});
  const [version, setVersion] = useState(0);

  const notify = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  const has = useCallback((id: CellDraftId) => {
    return Object.prototype.hasOwnProperty.call(draftsRef.current, id);
  }, []);

  const get = useCallback(
    (id: CellDraftId, fallback = "") => {
      if (Object.prototype.hasOwnProperty.call(draftsRef.current, id)) {
        return draftsRef.current[id] ?? "";
      }
      return safeStr(fallback);
    },
    []
  );

  const set = useCallback(
    (id: CellDraftId, value: string, opts?: { notify?: boolean }) => {
      draftsRef.current[id] = safeStr(value);
      if (opts?.notify) notify();
    },
    [notify]
  );

  const del = useCallback(
    (id: CellDraftId, opts?: { notify?: boolean }) => {
      if (Object.prototype.hasOwnProperty.call(draftsRef.current, id)) {
        delete draftsRef.current[id];
        if (opts?.notify) notify();
      }
    },
    [notify]
  );

  const clearAll = useCallback(
    (opts?: { notify?: boolean }) => {
      draftsRef.current = {};
      if (opts?.notify) notify();
    },
    [notify]
  );

  return { has, get, set, del, clearAll, notify, version };
}