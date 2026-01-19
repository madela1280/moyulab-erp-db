"use client";

import { useMemo, useState } from "react";
import { apiSignupTransfer, SignupTransferResponse } from "@/views/dataUpload/signup-transfer/serviceSignupTransfer";

type RowValues = Record<string, string>;

export function useSignupTransfer({ onError }: { onError?: (msg: string) => void } = {}) {
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<SignupTransferResponse | null>(null);

  const anyFailed = useMemo(() => !!last?.anyFailed, [last]);
  const anyConfirmNeeded = useMemo(() => !!last?.anyConfirmNeeded, [last]);

  async function submit(params: { rows: RowValues[]; selectedKeys: string[] }) {
    setLoading(true);
    try {
      const resp = await apiSignupTransfer({
        rows: params.rows,
        selectedKeys: params.selectedKeys,
        force: false,
        confirmDuplicates: false,
      });
      setLast(resp);
      return resp;
    } catch (e: any) {
      onError?.(String(e?.message || "전송에 실패했습니다."));
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function confirmAndSubmit(params: { rows: RowValues[]; selectedKeys: string[] }) {
    setLoading(true);
    try {
      const resp = await apiSignupTransfer({
        rows: params.rows,
        selectedKeys: params.selectedKeys,
        force: false,
        confirmDuplicates: true,
      });
      setLast(resp);
      return resp;
    } catch (e: any) {
      onError?.(String(e?.message || "전송에 실패했습니다."));
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function forceSubmit(params: { rows: RowValues[]; selectedKeys: string[] }) {
    setLoading(true);
    try {
      const resp = await apiSignupTransfer({
        rows: params.rows,
        selectedKeys: params.selectedKeys,
        force: true,
        confirmDuplicates: true,
      });
      setLast(resp);
      return resp;
    } catch (e: any) {
      onError?.(String(e?.message || "강제 전송에 실패했습니다."));
      throw e;
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setLast(null);
  }

  return {
    loading,
    last,
    anyFailed,
    anyConfirmNeeded,
    submit,
    confirmAndSubmit,
    forceSubmit,
    reset,
  };
}