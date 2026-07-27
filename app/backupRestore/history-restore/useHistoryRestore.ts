// app/backupRestore/history-restore/useHistoryRestore.ts

"use client";

import { useCallback, useMemo, useState } from "react";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
import {
  fetchHistoryOperationDetail,
  fetchHistoryOperations,
  restoreHistoryItems,
  type HistoryOperation,
  type HistoryOperationDetailResponse,
  type HistoryOperationItem,
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

function uniqueNumbers(values: number[]) {
  return Array.from(
    new Set(
      values
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
        .map((v) => Math.floor(v))
    )
  );
}

export function useHistoryRestore() {
  const recent7Dates = useMemo(() => buildRecent7Dates(), []);

  const [mode, setMode] = useState<HistoryRestoreMode>("today");
  const [selectedDate, setSelectedDate] = useState<string>("");

  const [operations, setOperations] = useState<HistoryOperation[]>([]);
  const [selectedOperationId, setSelectedOperationId] = useState<string>("");
  const [detail, setDetail] = useState<HistoryOperationDetailResponse | null>(null);

  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);

  const [loadingOperations, setLoadingOperations] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const [error, setError] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [restoreResult, setRestoreResult] = useState<HistoryRestoreResult | null>(null);

  const clearDetail = useCallback(() => {
    setSelectedOperationId("");
    setDetail(null);
    setSelectedItemIds([]);
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

      const restorableIds = (data.items || [])
        .filter((item: HistoryOperationItem) => item.restorable)
        .map((item: HistoryOperationItem) => Number(item.id));

      setSelectedItemIds(uniqueNumbers(restorableIds));
    } catch (err: any) {
      setError(err?.message || "변경이력 상세 조회에 실패했습니다.");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const toggleItem = useCallback((itemId: number) => {
    const id = Number(itemId);
    if (!Number.isFinite(id) || id <= 0) return;

    setSelectedItemIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      return uniqueNumbers([...prev, id]);
    });
  }, []);

  const selectAllRestorable = useCallback(() => {
    const ids = (detail?.items || [])
      .filter((item) => item.restorable)
      .map((item) => Number(item.id));

    setSelectedItemIds(uniqueNumbers(ids));
  }, [detail]);

  const clearSelectedItems = useCallback(() => {
    setSelectedItemIds([]);
  }, []);

  const restoreSelected = useCallback(async () => {
    const itemIds = uniqueNumbers(selectedItemIds);

    if (!itemIds.length) {
      setMessage("복원할 항목을 선택하세요.");
      return null;
    }

    const ok = window.confirm(
      `선택한 ${itemIds.length}개 항목을 현재 통합관리 데이터에 복원할까요?`
    );

    if (!ok) return null;

    setRestoring(true);
    setError("");
    setMessage("");
    setRestoreResult(null);

    try {
      const result = await restoreHistoryItems({
        itemIds,
        restoreReason: "변경이력복원 화면에서 선택 복원",
      });

      setRestoreResult(result);

      if (result.restoredCount > 0) {
        syncEmitUnifiedUpdate();
      }

      setMessage(
        `복원 완료: ${result.restoredCount}건 / 제외: ${result.skippedCount}건`
      );

      if (selectedOperationId) {
        const refreshed = await fetchHistoryOperationDetail(selectedOperationId);
        setDetail(refreshed);

        const restorableIds = (refreshed.items || [])
          .filter((item) => item.restorable)
          .map((item) => Number(item.id));

        setSelectedItemIds(uniqueNumbers(restorableIds));
      }

      return result;
    } catch (err: any) {
      setError(err?.message || "선택 복원에 실패했습니다.");
      return null;
    } finally {
      setRestoring(false);
    }
  }, [selectedItemIds, selectedOperationId]);

  return {
    mode,
    selectedDate,
    recent7Dates,

    operations,
    selectedOperationId,
    detail,
    selectedItemIds,

    loadingOperations,
    loadingDetail,
    restoring,

    error,
    message,
    restoreResult,

    loadToday,
    showRecent7Dates,
    loadDate,
    selectOperation,

    toggleItem,
    selectAllRestorable,
    clearSelectedItems,
    restoreSelected,
  };
}