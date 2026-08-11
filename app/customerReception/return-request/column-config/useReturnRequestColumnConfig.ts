"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RETURN_REQUEST_CURRENT_COLUMNS,
  RETURN_REQUEST_LIST_COLUMNS,
} from "@/customerReception/return-request/columns";
import type { ReturnRequestColumn } from "@/customerReception/return-request/types";
import {
  fetchReturnRequestGridSettings,
  saveReturnRequestGridSettings,
} from "@/customerReception/return-request/column-config/serviceReturnRequestColumnConfig";

function getMinWidth(key: string) {
  if (key === "checked") return 30;
  return 60;
}

function normalizeWidth(key: string, value: unknown, fallback = 120) {
  const n = Number(value);
  const min = getMinWidth(key);

  if (!Number.isFinite(n)) return Math.max(min, fallback);
  return Math.max(min, Math.min(800, Math.round(n)));
}

function buildDefaultWidths() {
  const allColumns = [...RETURN_REQUEST_CURRENT_COLUMNS, ...RETURN_REQUEST_LIST_COLUMNS];

  return allColumns.reduce<Record<string, number>>((acc, col) => {
    acc[col.key] = normalizeWidth(col.key, col.width, col.width);
    return acc;
  }, {});
}

function applyWidths(columns: ReturnRequestColumn[], columnWidths: Record<string, number>) {
  return columns.map((col) => ({
    ...col,
    width: normalizeWidth(col.key, columnWidths[col.key], col.width),
  }));
}

export function useReturnRequestColumnConfig() {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(buildDefaultWidths);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentColumns = useMemo(() => {
    return applyWidths(RETURN_REQUEST_CURRENT_COLUMNS, columnWidths);
  }, [columnWidths]);

  const listColumns = useMemo(() => {
    return applyWidths(RETURN_REQUEST_LIST_COLUMNS, columnWidths);
  }, [columnWidths]);

  const reloadColumnConfig = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const settings = await fetchReturnRequestGridSettings();
      const defaults = buildDefaultWidths();
      const nextWidths: Record<string, number> = { ...defaults };

      for (const [key, width] of Object.entries(settings.columnWidths || {})) {
        nextWidths[key] = normalizeWidth(key, width, defaults[key] ?? 120);
      }

      setColumnWidths(nextWidths);
    } catch (e: any) {
      setError(e?.message || "반납접수 열넓이를 불러오지 못했습니다.");
      setColumnWidths(buildDefaultWidths());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadColumnConfig();
  }, [reloadColumnConfig]);

  async function saveColumnWidth(key: string, width: number) {
    const columnKey = String(key || "").trim();
    if (!columnKey) return;

    const nextWidths = {
      ...columnWidths,
      [columnKey]: normalizeWidth(columnKey, width, columnWidths[columnKey] ?? 120),
    };

    setColumnWidths(nextWidths);
    setSaving(true);
    setError("");

    try {
      const saved = await saveReturnRequestGridSettings({
        columnWidths: nextWidths,
      });

      const defaults = buildDefaultWidths();
      const savedWidths: Record<string, number> = { ...defaults };

      for (const [savedKey, savedWidth] of Object.entries(saved.columnWidths || {})) {
        savedWidths[savedKey] = normalizeWidth(savedKey, savedWidth, defaults[savedKey] ?? 120);
      }

      setColumnWidths(savedWidths);
    } catch (e: any) {
      setError(e?.message || "반납접수 열넓이를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return {
    currentColumns,
    listColumns,
    columnWidths,
    loading,
    saving,
    error,
    saveColumnWidth,
    reloadColumnConfig,
  };
}