// app/backupRestore/history-restore/useHistoryRestore.ts

"use client";

import { useCallback, useMemo, useState } from "react";
import {
  fetchHistoryOperationDetail,
  fetchHistoryOperations,
  type HistoryOperation,
  type HistoryOperationDetailResponse,
  type HistoryRestoreMode,
  type HistoryRestoreResult,
} from "./serviceHistoryRestore";

function formatDateYYYYMMDD(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildRecent7Dates() {
  const dates: string[] = [];
  const today = new Date();

  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(formatDateYYYYMMDD(d));
  }

  return dates;
}

export function useHistoryRestore() {
  const recent7Dates = useMemo(() => buildRecent7Dates(), []);

  const [mode, setMode] = useState<HistoryRestoreMode>("today");
  const [selectedDate, setSelectedDate] = useState<string>("");

  const [operations, setOperations] = useState<HistoryOperation[]>([]);
  const [selectedOperationId, setSelectedOperationId] = useState<string>("");
  const [detail, setDetail] = useState<HistoryOperationDetailResponse | null>(null);

  const [loadingOperations, setLoadingOperations] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [restoreResult, setRestoreResult] = useState<HistoryRestoreResult | null>(null);

  const clearDetail = useCallback(() => {
    setSelectedOperationId("");
    setDetail(null);
    setRestoreResult(null);
  }, []);

  const loadOperations = useCallback(
    async (nextMode: HistoryRestoreMode, date?: string) => {
      setLoadingOperations(true);
      setError("");
      setMessage("");
      setRestoreResult(null);

      try {
        const data = await fetchHistoryOperations({
          mode: nextMode,
          date,
          limit: 500,
        });

        setMode(nextMode);
        setSelectedDate(nextMode === "date" ? String(date ?? "") : "");
        setOperations(data.operations || []);
        clearDetail();

        if (!data.operations?.length) {
          setMessage("조회된 변경이력이 없습니다.");
        }
      } catch (err: any) {
        setError(err?.message || "변경이력 목록 조회에 실패했습니다.");
      } finally {
        setLoadingOperations(false);
      }
    },
    [clearDetail]
  );

  const loadToday = useCallback(() => {
    return loadOperations("today");
  }, [loadOperations]);

  const showRecent7Dates = useCallback(() => {
    setMode("recent7");
    setSelectedDate("");
    setOperations([]);
    clearDetail();
    setError("");
    setMessage("날짜를 선택하세요.");
  }, [clearDetail]);

  const loadDate = useCallback(
    (date: string) => {
      return loadOperations("date", date);
    },
    [loadOperations]
  );

  const selectOperation = useCallback(async (operationId: string) => {
    const id = String(operationId ?? "").trim();
    if (!id) return;

    setLoadingDetail(true);
    setError("");
    setMessage("");
    setRestoreResult(null);

    try {
      const data = await fetchHistoryOperationDetail(id);

      setSelectedOperationId(id);
      setDetail(data);
    } catch (err: any) {
      setError(err?.message || "변경이력 상세 조회에 실패했습니다.");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  return {
    mode,
    selectedDate,
    recent7Dates,

    operations,
    selectedOperationId,
    detail,

    loadingOperations,
    loadingDetail,

    error,
    message,
    restoreResult,

    loadToday,
    showRecent7Dates,
    loadDate,
    selectOperation,
  };
}