// app/backupRestore/history-restore/useHistoryManualEdit.ts

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type HistoryOperationDetailResponse,
  type HistoryOperationItem,
} from "./serviceHistoryRestore";

function stringifyEditableValue(value: any) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type UseHistoryManualEditParams = {
  detail: HistoryOperationDetailResponse | null;
  canEditItem: (item: HistoryOperationItem) => boolean;
};

export function useHistoryManualEdit({
  detail,
  canEditItem,
}: UseHistoryManualEditParams) {
  const editableItems = useMemo(() => {
    return (detail?.items || []).filter((item) => canEditItem(item));
  }, [detail, canEditItem]);

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [draftValue, setDraftValue] = useState("");

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;

    return (
      editableItems.find((item) => Number(item.id) === Number(selectedItemId)) ??
      null
    );
  }, [editableItems, selectedItemId]);

  useEffect(() => {
    if (!editableItems.length) {
      setSelectedItemId(null);
      setDraftValue("");
      return;
    }

    const stillExists = editableItems.some(
      (item) => Number(item.id) === Number(selectedItemId)
    );

    if (!selectedItemId || !stillExists) {
      const firstItem = editableItems[0];
      setSelectedItemId(Number(firstItem.id));
      setDraftValue(stringifyEditableValue(firstItem.current_value));
    }
  }, [editableItems, selectedItemId]);

  useEffect(() => {
    if (!selectedItem) return;

    setDraftValue(stringifyEditableValue(selectedItem.current_value));
  }, [selectedItem]);

  const selectItem = useCallback(
    (itemId: number) => {
      const id = Number(itemId);
      if (!Number.isFinite(id) || id <= 0) return;

      const nextItem = editableItems.find((item) => Number(item.id) === id);
      if (!nextItem) return;

      setSelectedItemId(id);
      setDraftValue(stringifyEditableValue(nextItem.current_value));
    },
    [editableItems]
  );

  const fillFromBefore = useCallback(() => {
    if (!selectedItem) return;
    setDraftValue(stringifyEditableValue(selectedItem.before_value));
  }, [selectedItem]);

  const fillFromAfter = useCallback(() => {
    if (!selectedItem) return;
    setDraftValue(stringifyEditableValue(selectedItem.after_value));
  }, [selectedItem]);

  const fillFromCurrent = useCallback(() => {
    if (!selectedItem) return;
    setDraftValue(stringifyEditableValue(selectedItem.current_value));
  }, [selectedItem]);

  const resetDraft = useCallback(() => {
    if (!selectedItem) {
      setDraftValue("");
      return;
    }

    setDraftValue(stringifyEditableValue(selectedItem.current_value));
  }, [selectedItem]);

  const currentValueText = selectedItem
    ? stringifyEditableValue(selectedItem.current_value)
    : "";

  const hasDraftChanged = draftValue !== currentValueText;

  return {
    editableItems,
    selectedItem,
    selectedItemId,
    draftValue,
    hasDraftChanged,

    selectItem,
    setDraftValue,
    fillFromBefore,
    fillFromAfter,
    fillFromCurrent,
    resetDraft,
  };
}