"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SPECIFIC_DATE_SHIPMENT_COLUMNS,
  type SpecificDateShipmentColumn,
} from "@/views/dataUpload/specific-date-shipment/columns";
import {
  fetchSpecificDateShipmentGridSettings,
  saveSpecificDateShipmentGridSettings,
} from "@/views/dataUpload/specific-date-shipment/column-config/serviceSpecificDateShipmentColumnConfig";
import {
  addSpecificDateShipmentCustomColumn,
  deleteSpecificDateShipmentCustomColumn,
  fetchSpecificDateShipmentCustomColumns,
  type SpecificDateShipmentInsertPosition,
} from "@/views/dataUpload/specific-date-shipment/template/serviceSpecificDateShipmentTemplate";

function normalizeWidth(v: unknown, fallback = 140) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(60, Math.min(800, Math.round(n)));
}

function normalizeCustomColumns(columns: SpecificDateShipmentColumn[]) {
  const defaultKeys = new Set(SPECIFIC_DATE_SHIPMENT_COLUMNS.map((col) => col.key));

  return (Array.isArray(columns) ? columns : [])
    .filter((col) => col?.key && !defaultKeys.has(col.key))
    .map((col) => ({
      ...col,
      width: normalizeWidth(col.width, 140),
    }));
}

function buildDefaultWidths() {
  return SPECIFIC_DATE_SHIPMENT_COLUMNS.reduce<Record<string, number>>((acc, col) => {
    acc[col.key] = normalizeWidth(col.width, 140);
    return acc;
  }, {});
}

function buildAllColumns(customColumns: SpecificDateShipmentColumn[], columnWidths: Record<string, number>) {
  const normalizedCustomColumns = normalizeCustomColumns(customColumns);

  return [...SPECIFIC_DATE_SHIPMENT_COLUMNS, ...normalizedCustomColumns].map((col) => ({
    ...col,
    width: normalizeWidth(columnWidths[col.key], col.width),
  }));
}

function normalizeColumnOrder(columnOrder: string[], allColumns: SpecificDateShipmentColumn[]) {
  const allKeys = allColumns.map((col) => col.key);
  const allowed = new Set(allKeys);
  const unique = Array.from(
    new Set((Array.isArray(columnOrder) ? columnOrder : []).map((key) => String(key || "").trim()).filter(Boolean))
  );

  const filtered = unique.filter((key) => allowed.has(key));
  const missing = allKeys.filter((key) => !filtered.includes(key));

  return [...filtered, ...missing];
}

function normalizeColumnWidths(columnWidths: Record<string, number>, allColumns: SpecificDateShipmentColumn[]) {
  const input = columnWidths && typeof columnWidths === "object" ? columnWidths : {};
  const next: Record<string, number> = {};

  for (const col of allColumns) {
    next[col.key] = normalizeWidth(input[col.key], col.width);
  }

  return next;
}

function buildOrderedColumns(allColumns: SpecificDateShipmentColumn[], columnOrder: string[]) {
  const normalizedOrder = normalizeColumnOrder(columnOrder, allColumns);
  const columnMap = new Map(allColumns.map((col) => [col.key, col]));

  return normalizedOrder.map((key) => columnMap.get(key)).filter(Boolean) as SpecificDateShipmentColumn[];
}

export function useSpecificDateShipmentColumnConfig() {
  const defaultOrder = useMemo(() => SPECIFIC_DATE_SHIPMENT_COLUMNS.map((col) => col.key), []);
  const [customColumns, setCustomColumns] = useState<SpecificDateShipmentColumn[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(buildDefaultWidths);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const allColumns = useMemo(() => buildAllColumns(customColumns, columnWidths), [customColumns, columnWidths]);
  const orderedColumns = useMemo(() => buildOrderedColumns(allColumns, columnOrder), [allColumns, columnOrder]);

  const reloadColumnConfig = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [loadedCustomColumns, settings] = await Promise.all([
        fetchSpecificDateShipmentCustomColumns(),
        fetchSpecificDateShipmentGridSettings(),
      ]);

      const nextCustomColumns = normalizeCustomColumns(loadedCustomColumns);
      const tempAllColumns = buildAllColumns(nextCustomColumns, settings.columnWidths);
      const nextColumnWidths = normalizeColumnWidths(settings.columnWidths, tempAllColumns);
      const finalAllColumns = buildAllColumns(nextCustomColumns, nextColumnWidths);
      const nextColumnOrder = normalizeColumnOrder(settings.columnOrder, finalAllColumns);

      setCustomColumns(nextCustomColumns);
      setColumnWidths(nextColumnWidths);
      setColumnOrder(nextColumnOrder);
    } catch (e: any) {
      setError(e?.message || "특정일자출고 열 설정을 불러오지 못했습니다.");
      setCustomColumns([]);
      setColumnWidths(buildDefaultWidths());
      setColumnOrder(defaultOrder);
    } finally {
      setLoading(false);
    }
  }, [defaultOrder]);

  useEffect(() => {
    void reloadColumnConfig();
  }, [reloadColumnConfig]);

  async function saveColumnOrder(nextOrder: string[]) {
    const normalizedOrder = normalizeColumnOrder(nextOrder, allColumns);
    const normalizedWidths = normalizeColumnWidths(columnWidths, allColumns);

    setColumnOrder(normalizedOrder);
    setColumnWidths(normalizedWidths);
    setSaving(true);
    setError("");

    try {
      const saved = await saveSpecificDateShipmentGridSettings({
        columnOrder: normalizedOrder,
        columnWidths: normalizedWidths,
      });

      const nextWidths = normalizeColumnWidths(saved.columnWidths, allColumns);
      setColumnOrder(normalizeColumnOrder(saved.columnOrder, allColumns));
      setColumnWidths(nextWidths);
    } catch (e: any) {
      setError(e?.message || "특정일자출고 열 설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function saveColumnWidth(key: string, width: number) {
    const columnKey = String(key || "").trim();
    if (!columnKey) return;

    const nextWidths = {
      ...columnWidths,
      [columnKey]: normalizeWidth(width, columnWidths[columnKey] || 140),
    };

    const normalizedOrder = normalizeColumnOrder(columnOrder, allColumns);

    setColumnWidths(nextWidths);
    setSaving(true);
    setError("");

    try {
      const saved = await saveSpecificDateShipmentGridSettings({
        columnOrder: normalizedOrder,
        columnWidths: nextWidths,
      });

      setColumnOrder(normalizeColumnOrder(saved.columnOrder, allColumns));
      setColumnWidths(normalizeColumnWidths(saved.columnWidths, allColumns));
    } catch (e: any) {
      setError(e?.message || "특정일자출고 열넓이를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function addCustomColumn(label: string, referenceKey: string, position: SpecificDateShipmentInsertPosition) {
    const columnLabel = String(label || "").trim();
    const refKey = String(referenceKey || "").trim();

    if (!columnLabel || !refKey) return;

    setSaving(true);
    setError("");

    try {
      await addSpecificDateShipmentCustomColumn({
        label: columnLabel,
        referenceKey: refKey,
        position,
        width: 140,
      });

      await reloadColumnConfig();
    } catch (e: any) {
      setError(e?.message || "특정일자출고 추가 컬럼을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomColumn(key: string) {
    const columnKey = String(key || "").trim();
    if (!columnKey) return;

    setSaving(true);
    setError("");

    try {
      await deleteSpecificDateShipmentCustomColumn(columnKey);
      await reloadColumnConfig();
    } catch (e: any) {
      setError(e?.message || "특정일자출고 추가 컬럼을 삭제하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return {
    columnOrder,
    columnWidths,
    customColumns,
    allColumns,
    orderedColumns,
    loading,
    saving,
    error,
    saveColumnOrder,
    saveColumnWidth,
    addCustomColumn,
    deleteCustomColumn,
    reloadColumnConfig,
  };
}
