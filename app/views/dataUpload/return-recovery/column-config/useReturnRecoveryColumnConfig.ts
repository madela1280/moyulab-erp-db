"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RETURN_RECOVERY_COLUMNS,
  type ReturnRecoveryColumn,
} from "@/views/dataUpload/return-recovery/columns";
import {
  fetchReturnRecoveryColumnOrder,
  saveReturnRecoveryColumnOrder,
} from "@/views/dataUpload/return-recovery/column-config/serviceReturnRecoveryColumnConfig";

function normalizeColumnOrder(columnOrder: string[]) {
  const defaultKeys = RETURN_RECOVERY_COLUMNS.map((col) => col.key);
  const allowed = new Set(defaultKeys);
  const unique = Array.from(new Set((Array.isArray(columnOrder) ? columnOrder : []).filter((key) => allowed.has(key))));
  const missing = defaultKeys.filter((key) => !unique.includes(key));

  return [...unique, ...missing];
}

function buildOrderedColumns(columnOrder: string[]): ReturnRecoveryColumn[] {
  const normalizedOrder = normalizeColumnOrder(columnOrder);
  const columnMap = new Map(RETURN_RECOVERY_COLUMNS.map((col) => [col.key, col]));

  return normalizedOrder.map((key) => columnMap.get(key)).filter(Boolean) as ReturnRecoveryColumn[];
}

export function useReturnRecoveryColumnConfig() {
  const defaultOrder = useMemo(() => RETURN_RECOVERY_COLUMNS.map((col) => col.key), []);
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const orderedColumns = useMemo(() => buildOrderedColumns(columnOrder), [columnOrder]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const loadedOrder = await fetchReturnRecoveryColumnOrder();
        if (!alive) return;
        setColumnOrder(normalizeColumnOrder(loadedOrder));
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "반납회수 열 설정을 불러오지 못했습니다.");
        setColumnOrder(defaultOrder);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [defaultOrder]);

  async function saveColumnOrder(nextOrder: string[]) {
    const normalizedOrder = normalizeColumnOrder(nextOrder);
    setColumnOrder(normalizedOrder);
    setSaving(true);
    setError("");

    try {
      const savedOrder = await saveReturnRecoveryColumnOrder(normalizedOrder);
      setColumnOrder(normalizeColumnOrder(savedOrder));
    } catch (e: any) {
      setError(e?.message || "반납회수 열 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return {
    columnOrder,
    orderedColumns,
    loading,
    saving,
    error,
    saveColumnOrder,
  };
}