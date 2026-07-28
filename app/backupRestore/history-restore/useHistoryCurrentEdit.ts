// app/backupRestore/history-restore/useHistoryCurrentEdit.ts

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";
import {
  saveHistoryManualChanges,
  type HistoryManualSaveResult,
} from "./serviceHistoryManualSave";
import {
  type HistoryOperationDetailResponse,
  type HistoryOperationItem,
} from "./serviceHistoryRestore";

export type HistoryCurrentGridRow = {
  rowKey: string;
  unified_id: number | null;
  row_number: number | null;
  baseData: Record<string, any>;
  isNew: boolean;
};

type SelectedCell = {
  rowKey: string;
  columnKey: string;
};

type UseHistoryCurrentEditParams = {
  detail: HistoryOperationDetailResponse | null;
  columns: string[];
  onSaved?: () => void | Promise<void>;
};

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

function stringifyCellValue(value: any) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildRowKey(unifiedId: number | null, fallback: string) {
  if (Number.isFinite(Number(unifiedId)) && Number(unifiedId) > 0) {
    return `u:${Math.floor(Number(unifiedId))}`;
  }

  return fallback;
}

function getCurrentRowData(item: HistoryOperationItem) {
  if (isPlainObject(item.current_row_data)) return item.current_row_data;
  if (isPlainObject(item.after_row_data)) return item.after_row_data;
  if (isPlainObject(item.before_row_data)) return item.before_row_data;
  return {};
}

function buildInitialRows(detail: HistoryOperationDetailResponse | null) {
  const rowMap = new Map<string, HistoryCurrentGridRow>();

  for (const item of detail?.items || []) {
    const unifiedId =
      Number.isFinite(Number(item.unified_id)) && Number(item.unified_id) > 0
        ? Math.floor(Number(item.unified_id))
        : null;

    const rowKey = buildRowKey(unifiedId, `item:${item.id}`);
    const rowData = getCurrentRowData(item);
    const rowNumber =
      Number.isFinite(Number((item as any).row_number)) && Number((item as any).row_number) > 0
        ? Math.floor(Number((item as any).row_number))
        : null;

    const prev = rowMap.get(rowKey);

    if (!prev) {
      rowMap.set(rowKey, {
        rowKey,
        unified_id: unifiedId,
        row_number: rowNumber,
        baseData: rowData,
        isNew: false,
      });
      continue;
    }

    const prevKeyCount = Object.keys(prev.baseData || {}).length;
    const nextKeyCount = Object.keys(rowData || {}).length;

    rowMap.set(rowKey, {
      ...prev,
      row_number: prev.row_number ?? rowNumber,
      baseData: nextKeyCount >= prevKeyCount ? rowData : prev.baseData,
    });
  }

  return Array.from(rowMap.values()).sort((a, b) => {
    const ar = Number(a.row_number);
    const br = Number(b.row_number);

    if (Number.isFinite(ar) && Number.isFinite(br)) return ar - br;

    const ai = Number(a.unified_id);
    const bi = Number(b.unified_id);

    if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;

    return a.rowKey.localeCompare(b.rowKey);
  });
}

function buildSourceChangedCellSet(detail: HistoryOperationDetailResponse | null) {
  const set = new Set<string>();

  for (const item of detail?.items || []) {
    const unifiedId =
      Number.isFinite(Number(item.unified_id)) && Number(item.unified_id) > 0
        ? Math.floor(Number(item.unified_id))
        : null;

    const rowKey = buildRowKey(unifiedId, `item:${item.id}`);
    const columnKey = normalizeString(item.column_key);

    if (columnKey) {
      set.add(`${rowKey}::${columnKey}`);
    }
  }

  return set;
}

function buildInitialDraftMap(rows: HistoryCurrentGridRow[], columns: string[]) {
  const map = new Map<string, string>();

  for (const row of rows) {
    for (const columnKey of columns) {
      map.set(`${row.rowKey}::${columnKey}`, stringifyCellValue(row.baseData?.[columnKey]));
    }
  }

  return map;
}

export function useHistoryCurrentEdit({
  detail,
  columns,
  onSaved,
}: UseHistoryCurrentEditParams) {
  const [newRowSeq, setNewRowSeq] = useState(1);
  const [extraRows, setExtraRows] = useState<HistoryCurrentGridRow[]>([]);
  const [draftMap, setDraftMap] = useState<Map<string, string>>(new Map());
  const [deletedRowKeys, setDeletedRowKeys] = useState<Set<string>>(new Set());
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saveResult, setSaveResult] = useState<HistoryManualSaveResult | null>(null);

  const baseRows = useMemo(() => buildInitialRows(detail), [detail]);
  const sourceChangedCellSet = useMemo(() => buildSourceChangedCellSet(detail), [detail]);

  const rows = useMemo(() => {
    return [...baseRows, ...extraRows];
  }, [baseRows, extraRows]);

  useEffect(() => {
    setNewRowSeq(1);
    setExtraRows([]);
    setDeletedRowKeys(new Set());
    setSelectedCell(null);
    setError("");
    setMessage("");
    setSaveResult(null);

    const initialRows = buildInitialRows(detail);
    setDraftMap(buildInitialDraftMap(initialRows, columns));
  }, [detail, columns]);

  const baseRowMap = useMemo(() => {
    const map = new Map<string, HistoryCurrentGridRow>();

    for (const row of baseRows) {
      map.set(row.rowKey, row);
    }

    return map;
  }, [baseRows]);

  const allRowMap = useMemo(() => {
    const map = new Map<string, HistoryCurrentGridRow>();

    for (const row of rows) {
      map.set(row.rowKey, row);
    }

    return map;
  }, [rows]);

  const getBaseValue = useCallback(
    (rowKey: string, columnKey: string) => {
      const row = allRowMap.get(rowKey);
      if (!row) return "";

      return stringifyCellValue(row.baseData?.[columnKey]);
    },
    [allRowMap]
  );

  const getCellValue = useCallback(
    (rowKey: string, columnKey: string) => {
      const key = `${rowKey}::${columnKey}`;
      if (draftMap.has(key)) return draftMap.get(key) ?? "";
      return getBaseValue(rowKey, columnKey);
    },
    [draftMap, getBaseValue]
  );

  const setCellValue = useCallback((rowKey: string, columnKey: string, value: string) => {
    const key = `${rowKey}::${columnKey}`;

    setDraftMap((prev) => {
      const next = new Map(prev);
      next.set(key, value);
      return next;
    });

    setError("");
    setMessage("");
    setSaveResult(null);
  }, []);

  const selectCell = useCallback((rowKey: string, columnKey: string) => {
    setSelectedCell({ rowKey, columnKey });
  }, []);

  const clearSelectedCell = useCallback(() => {
    if (!selectedCell) return;
    setCellValue(selectedCell.rowKey, selectedCell.columnKey, "");
  }, [selectedCell, setCellValue]);

  const isCellDirty = useCallback(
    (rowKey: string, columnKey: string) => {
      const row = allRowMap.get(rowKey);
      if (!row) return false;

      if (row.isNew) {
        return normalizeString(getCellValue(rowKey, columnKey)) !== "";
      }

      return getCellValue(rowKey, columnKey) !== getBaseValue(rowKey, columnKey);
    },
    [allRowMap, getBaseValue, getCellValue]
  );

  const isSourceChangedCell = useCallback(
    (rowKey: string, columnKey: string) => {
      return sourceChangedCellSet.has(`${rowKey}::${columnKey}`);
    },
    [sourceChangedCellSet]
  );

  const isRowDeleted = useCallback(
    (rowKey: string) => {
      return deletedRowKeys.has(rowKey);
    },
    [deletedRowKeys]
  );

  const isNewRow = useCallback(
    (rowKey: string) => {
      return !!allRowMap.get(rowKey)?.isNew;
    },
    [allRowMap]
  );

  const addRowAfterSelected = useCallback(() => {
    const seq = newRowSeq;
    const rowKey = `new:${Date.now()}:${seq}`;

    const newRow: HistoryCurrentGridRow = {
      rowKey,
      unified_id: null,
      row_number: null,
      baseData: {},
      isNew: true,
    };

    setNewRowSeq((prev) => prev + 1);

    setExtraRows((prev) => {
      if (!selectedCell) return [...prev, newRow];

      const selectedIndex = rows.findIndex((row) => row.rowKey === selectedCell.rowKey);
      if (selectedIndex < 0) return [...prev, newRow];

      const nextAllRows = [...rows];
      nextAllRows.splice(selectedIndex + 1, 0, newRow);

      const nextExtraRows = nextAllRows.filter((row) => row.isNew);
      return nextExtraRows;
    });

    setDraftMap((prev) => {
      const next = new Map(prev);

      for (const columnKey of columns) {
        next.set(`${rowKey}::${columnKey}`, "");
      }

      return next;
    });

    setSelectedCell({ rowKey, columnKey: columns[0] ?? "" });
    setError("");
    setMessage("");
    setSaveResult(null);
  }, [columns, newRowSeq, rows, selectedCell]);

  const markSelectedRowDeleted = useCallback(() => {
    if (!selectedCell) return;

    const row = allRowMap.get(selectedCell.rowKey);
    if (!row) return;

    if (row.isNew) {
      setExtraRows((prev) => prev.filter((x) => x.rowKey !== row.rowKey));
      setDeletedRowKeys((prev) => {
        const next = new Set(prev);
        next.delete(row.rowKey);
        return next;
      });
      setSelectedCell(null);
      return;
    }

    setDeletedRowKeys((prev) => {
      const next = new Set(prev);
      next.add(row.rowKey);
      return next;
    });

    setError("");
    setMessage("");
    setSaveResult(null);
  }, [allRowMap, selectedCell]);

  const undoSelectedRow = useCallback(() => {
    if (!selectedCell) return;

    const row = allRowMap.get(selectedCell.rowKey);
    if (!row) return;

    if (row.isNew) {
      setExtraRows((prev) => prev.filter((x) => x.rowKey !== row.rowKey));
      setSelectedCell(null);
      return;
    }

    setDeletedRowKeys((prev) => {
      const next = new Set(prev);
      next.delete(row.rowKey);
      return next;
    });

    setDraftMap((prev) => {
      const next = new Map(prev);

      for (const columnKey of columns) {
        next.set(`${row.rowKey}::${columnKey}`, stringifyCellValue(row.baseData?.[columnKey]));
      }

      return next;
    });

    setError("");
    setMessage("");
    setSaveResult(null);
  }, [allRowMap, columns, selectedCell]);

  const dirtyCount = useMemo(() => {
    let count = 0;

    for (const row of rows) {
      if (deletedRowKeys.has(row.rowKey)) {
        count++;
        continue;
      }

      if (row.isNew) {
        const hasAnyValue = columns.some(
          (columnKey) => normalizeString(getCellValue(row.rowKey, columnKey)) !== ""
        );

        if (hasAnyValue) count++;
        continue;
      }

      for (const columnKey of columns) {
        if (isCellDirty(row.rowKey, columnKey)) {
          count++;
        }
      }
    }

    return count;
  }, [columns, deletedRowKeys, getCellValue, isCellDirty, rows]);

  const buildSavePayload = useCallback(() => {
    const updates: Array<{
      unified_id: number;
      column_key: string;
      before_value: any;
      expected_current_value: any;
      next_value: any;
    }> = [];

    const deletes: Array<{
      unified_id: number;
      expected_row_data: Record<string, any>;
    }> = [];

    const inserts: Array<{
      after_row_key: string | null;
      data: Record<string, any>;
    }> = [];

    for (const row of rows) {
      if (row.isNew) {
        const data: Record<string, any> = {};

        for (const columnKey of columns) {
          const value = getCellValue(row.rowKey, columnKey);
          if (normalizeString(value) !== "") {
            data[columnKey] = value;
          }
        }

        if (Object.keys(data).length > 0) {
          inserts.push({
            after_row_key: selectedCell?.rowKey ?? null,
            data,
          });
        }

        continue;
      }

      if (!row.unified_id) continue;

      if (deletedRowKeys.has(row.rowKey)) {
        deletes.push({
          unified_id: row.unified_id,
          expected_row_data: row.baseData,
        });
        continue;
      }

      for (const columnKey of columns) {
        const beforeText = getBaseValue(row.rowKey, columnKey);
        const nextText = getCellValue(row.rowKey, columnKey);

        if (beforeText === nextText) continue;

        updates.push({
          unified_id: row.unified_id,
          column_key: columnKey,
          before_value: beforeText,
          expected_current_value: beforeText,
          next_value: nextText,
        });
      }
    }

    return {
      operationId: detail?.operation.operation_id ?? "",
      updates,
      deletes,
      inserts,
    };
  }, [columns, deletedRowKeys, detail, getBaseValue, getCellValue, rows, selectedCell]);

  const saveChanges = useCallback(async () => {
    const payload = buildSavePayload();

    if (
      !payload.updates.length &&
      !payload.deletes.length &&
      !payload.inserts.length
    ) {
      setMessage("저장할 변경사항이 없습니다.");
      return null;
    }

    const ok = window.confirm(
      `현재 화면의 변경사항을 저장할까요?\n\n셀수정 ${payload.updates.length}건 / 행삭제 ${payload.deletes.length}건 / 행추가 ${payload.inserts.length}건`
    );

    if (!ok) return null;

    setSaving(true);
    setError("");
    setMessage("");
    setSaveResult(null);

    try {
      const result = await saveHistoryManualChanges(payload);

      setSaveResult(result);
      setMessage(
        `저장 완료: 수정 ${result.updatedCount}건 / 행추가 ${result.insertedCount}건 / 행삭제 ${result.deletedCount}건 / 제외 ${result.skippedCount}건`
      );

      if (
        result.updatedCount > 0 ||
        result.insertedCount > 0 ||
        result.deletedCount > 0
      ) {
        syncEmitUnifiedUpdate();
      }

      if (onSaved) {
        await onSaved();
      }

      return result;
    } catch (err: any) {
      setError(err?.message || "수정 저장에 실패했습니다.");
      return null;
    } finally {
      setSaving(false);
    }
  }, [buildSavePayload, onSaved]);

  return {
    rows,
    selectedCell,
    dirtyCount,
    saving,
    error,
    message,
    saveResult,

    selectCell,
    getCellValue,
    setCellValue,
    clearSelectedCell,
    addRowAfterSelected,
    markSelectedRowDeleted,
    undoSelectedRow,
    isCellDirty,
    isSourceChangedCell,
    isRowDeleted,
    isNewRow,
    saveChanges,
  };
}