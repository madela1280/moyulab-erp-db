"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ReturnRequestRow,
  ReturnRequestViewMode,
} from "@/customerReception/return-request/types";
import {
  fetchReturnRequests,
  updateReturnRequestWebCell,
} from "@/customerReception/return-request/serviceReturnRequests";
import { syncListen } from "@/global-sync/sync-engine";

export function useReturnRequests(mode: ReturnRequestViewMode) {
  const [currentRows, setCurrentRows] = useState<ReturnRequestRow[]>([]);
  const [listRows, setListRows] = useState<ReturnRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reloadCurrent = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const rows = await fetchReturnRequests({ status: "접수중" });
      setCurrentRows(rows);
    } catch (e: any) {
      setError(e?.message || "반납접수 목록을 불러오지 못했습니다.");
      setCurrentRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadList = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const rows = await fetchReturnRequests();
      setListRows(rows);
    } catch (e: any) {
      setError(e?.message || "반납접수 리스트를 불러오지 못했습니다.");
      setListRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadCurrentSilent = useCallback(async () => {
    try {
      const rows = await fetchReturnRequests({ status: "접수중" });
      setCurrentRows(rows);
    } catch (e: any) {
      setError(e?.message || "반납접수 목록을 다시 불러오지 못했습니다.");
    }
  }, []);

  const reloadListSilent = useCallback(async () => {
    try {
      const rows = await fetchReturnRequests();
      setListRows(rows);
    } catch (e: any) {
      setError(e?.message || "반납접수 리스트를 다시 불러오지 못했습니다.");
    }
  }, []);

  const saveWebCell = useCallback(
    async (row: ReturnRequestRow, colKey: string, value: string) => {
      if (mode === "list") return;

      setSaving(true);
      setError("");

      try {
        await updateReturnRequestWebCell(row, colKey, value);
        await reloadCurrentSilent();
      } catch (e: any) {
        setError(e?.message || "반납접수 수정값을 저장하지 못했습니다.");
        await reloadCurrentSilent();
      } finally {
        setSaving(false);
      }
    },
    [mode, reloadCurrentSilent]
  );

  useEffect(() => {
    if (mode === "list") {
      void reloadList();
      return;
    }

    void reloadCurrent();
  }, [mode, reloadCurrent, reloadList]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = syncListen(() => {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        if (mode === "list") {
          void reloadListSilent();
          return;
        }

        void reloadCurrentSilent();
      }, 250);
    });

    return () => {
      if (timer) {
        clearTimeout(timer);
      }

      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [mode, reloadCurrentSilent, reloadListSilent]);

  return {
    currentRows,
    listRows,
    loading,
    saving,
    error,
    setCurrentRows,
    setListRows,
    reloadCurrent,
    reloadList,
    saveWebCell,
  };
}