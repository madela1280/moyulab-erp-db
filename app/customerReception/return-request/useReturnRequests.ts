"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ReturnRequestRow,
  ReturnRequestViewMode,
} from "@/customerReception/return-request/types";
import { fetchReturnRequests } from "@/customerReception/return-request/serviceReturnRequests";

export function useReturnRequests(mode: ReturnRequestViewMode) {
  const [currentRows, setCurrentRows] = useState<ReturnRequestRow[]>([]);
  const [listRows, setListRows] = useState<ReturnRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    if (mode === "list") {
      void reloadList();
      return;
    }

    void reloadCurrent();
  }, [mode, reloadCurrent, reloadList]);

  return {
    currentRows,
    listRows,
    loading,
    error,
    setCurrentRows,
    setListRows,
    reloadCurrent,
    reloadList,
  };
}