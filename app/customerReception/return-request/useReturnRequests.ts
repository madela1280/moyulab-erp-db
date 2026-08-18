"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ReturnRequestRow,
  ReturnRequestViewMode,
} from "@/customerReception/return-request/types";
import {
  deleteReturnRequestRows,
  fetchReturnRequests,
  submitReturnRequestRows,
  updateReturnRequestWebCell,
} from "@/customerReception/return-request/serviceReturnRequests";
import { syncEmitUnifiedUpdate, syncListen } from "@/global-sync/sync-engine";

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

        /*
         * 노란색 웹접수 컬럼 수정 후에는 재조회해서
         * 수정된 웹접수값 기준으로 불일치사유만 다시 계산되게 한다.
         * 통합관리에는 여기서 저장하지 않는다.
         */
        await reloadCurrentSilent();
      } catch (e: any) {
        /*
         * 화면 아래에 "수정 대상 반납접수 행을 찾지 못했습니다" 같은
         * 오류 문구가 계속 노출되지 않도록 setError 하지 않는다.
         * 저장 실패 시에는 서버값 기준으로 다시 맞춘다.
         */
        console.warn("return request web cell save failed:", e);
        await reloadCurrentSilent();
      } finally {
        setSaving(false);
      }
    },
    [mode, reloadCurrentSilent]
  );

  const submitCheckedRows = useCallback(
    async (rows: ReturnRequestRow[]) => {
      if (mode === "list") {
        return {
          ok: false,
          message: "리스트 화면에서는 전송할 수 없습니다.",
          successCount: 0,
          failedRows: [],
        };
      }

      setSaving(true);
      setError("");

      try {
        const result = await submitReturnRequestRows(rows);

        if (result?.ok) {
          await reloadCurrentSilent();
          syncEmitUnifiedUpdate();
          return result;
        }

        setError(result?.message || "반납접수 전송에 실패했습니다.");
        await reloadCurrentSilent();
        return result;
      } catch (e: any) {
        const message = e?.message || "반납접수 전송에 실패했습니다.";
        setError(message);
        await reloadCurrentSilent();

        return {
          ok: false,
          message,
          successCount: 0,
          failedRows: [],
        };
      } finally {
        setSaving(false);
      }
    },
    [mode, reloadCurrentSilent]
  );

  const deleteCheckedRows = useCallback(
    async (rows: ReturnRequestRow[]) => {
      if (mode === "list") {
        return {
          ok: false,
          message: "리스트 화면에서는 삭제할 수 없습니다.",
          successCount: 0,
          failedRows: [],
        };
      }

      setSaving(true);
      setError("");

      try {
        const result = await deleteReturnRequestRows(rows);

        if (result?.ok) {
          await reloadCurrentSilent();
          syncEmitUnifiedUpdate();
          return result;
        }

        setError(result?.message || "반납접수 삭제에 실패했습니다.");
        await reloadCurrentSilent();
        return result;
      } catch (e: any) {
        const message = e?.message || "반납접수 삭제에 실패했습니다.";
        setError(message);
        await reloadCurrentSilent();

        return {
          ok: false,
          message,
          successCount: 0,
          failedRows: [],
        };
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
    submitCheckedRows,
    deleteCheckedRows,
  };
}