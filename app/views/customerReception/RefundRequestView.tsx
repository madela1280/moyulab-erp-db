"use client";

// app/views/customerReception/RefundRequestView.tsx
//
// 고객접수 > 환불접수. 카카오 챗봇으로 접수된 환불 요청을 그리드로 보여준다. 데이터는 CS서버
// 자기 DB(refund_requests)에서 오며(반납접수와 동일 원칙), ERP 자체 API가 CS서버를 대신
// 호출해서 가져온다. 8초마다 폴링해서 새 접수를 자동 반영한다.

import { useEffect, useRef, useState } from "react";
import RefundRequestHeader from "@/views/customerReception/refund-request/RefundRequestHeader";
import RefundRequestGrid from "@/views/customerReception/refund-request/RefundRequestGrid";
import {
  fetchRefundRequests,
  updateRefundRequestField,
  deleteRefundRequests,
  fetchRefundRequestGridSettings,
  saveRefundRequestGridSettings,
  type RefundRequestGridSettings,
} from "@/views/customerReception/refund-request/service";
import {
  REFUND_REQUEST_COLUMNS,
  type RefundRequestColumn,
  type RefundRequestRow,
} from "@/views/customerReception/refund-request/columns";

function applyGridSettings(
  baseColumns: RefundRequestColumn[],
  settings: RefundRequestGridSettings
): RefundRequestColumn[] {
  let ordered = baseColumns;

  if (settings.columnOrder.length) {
    const byKey = new Map(baseColumns.map((col) => [col.key, col]));
    const seen = new Set<string>();
    const reordered: RefundRequestColumn[] = [];

    for (const key of settings.columnOrder) {
      const col = byKey.get(key);
      if (col && !seen.has(key)) {
        reordered.push(col);
        seen.add(key);
      }
    }
    for (const col of baseColumns) {
      if (!seen.has(col.key)) reordered.push(col);
    }
    ordered = reordered;
  }

  return ordered.map((col) => {
    const width = settings.columnWidths[col.key];
    return typeof width === "number" && width > 0 ? { ...col, width } : col;
  });
}

// 입금상태/메모는 직원이 직접 채우는 칸이라, 폴링 때 서버값으로 덮어써버리면 타이핑 중이던
// 내용이 날아간다 — 그래서 이 칸들만 기존 화면 값을 그대로 보존한다(포장재구매 화면과 동일 원칙).
const MANUAL_ONLY_KEYS = ["payment_status", "memo"];

function mergePolledRows(freshRows: RefundRequestRow[], prevRows: RefundRequestRow[]): RefundRequestRow[] {
  const prevById = new Map(prevRows.map((r) => [r.id, r]));
  return freshRows.map((row) => {
    const prev = prevById.get(row.id);
    if (!prev) return row;
    const mergedData = { ...row.data };
    for (const key of MANUAL_ONLY_KEYS) {
      if (prev.data?.[key] !== undefined) mergedData[key] = prev.data[key];
    }
    return { ...row, data: mergedData };
  });
}

export default function RefundRequestView() {
  const [rows, setRows] = useState<RefundRequestRow[]>([]);
  const [columns, setColumns] = useState<RefundRequestColumn[]>(REFUND_REQUEST_COLUMNS);
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const saveSettingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const nextRows = await fetchRefundRequests();
      setRows(nextRows);
      setSelectedIds(new Set());
    } catch (e: any) {
      setError(e?.message || "환불접수 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();

    (async () => {
      const settings = await fetchRefundRequestGridSettings();
      if (settings.columnOrder.length || Object.keys(settings.columnWidths).length) {
        setColumns((prev) => applyGridSettings(prev, settings));
      }
    })();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const nextRows = await fetchRefundRequests();
        setRows((prev) => mergePolledRows(nextRows, prev));
        setSelectedIds((prev) => {
          const stillExists = new Set(nextRows.map((r) => r.id));
          return new Set(Array.from(prev).filter((id) => stillExists.has(id)));
        });
      } catch {
        // 폴링 실패는 조용히 무시
      }
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  function handleColumnsChange(nextColumns: RefundRequestColumn[]) {
    setColumns(nextColumns);

    if (saveSettingsTimer.current) clearTimeout(saveSettingsTimer.current);
    saveSettingsTimer.current = setTimeout(() => {
      const columnOrder = nextColumns.map((col) => col.key);
      const columnWidths = Object.fromEntries(nextColumns.map((col) => [col.key, col.width]));
      saveRefundRequestGridSettings(columnOrder, columnWidths);
    }, 400);
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set());
  }

  // 텍스트 칸은 입력 중 계속 쏘지 않게 400ms 묶어서 저장, 드롭다운(입금상태)은 onChange라 이미
  // 1번만 호출됨 — 같은 디바운스 맵을 재사용해도 무방(마지막 값만 남아 저장됨).
  function handleFieldSave(rowId: string, field: string, value: string) {
    const key = `${rowId}:${field}`;
    const timers = saveTimers.current;
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      timers.delete(key);
      try {
        await updateRefundRequestField(rowId, field, value);
      } catch (e: any) {
        setError(e?.message || "저장하지 못했습니다.");
      }
    }, 300);
    timers.set(key, timer);
  }

  async function handleDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) return;

    setError("");
    try {
      await deleteRefundRequests(Array.from(selectedIds));
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "삭제하지 못했습니다.");
    }
  }

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <RefundRequestHeader
        loading={loading}
        isColumnEditMode={isColumnEditMode}
        hasSelection={selectedIds.size > 0}
        onRefresh={loadRows}
        onDelete={handleDelete}
        onToggleColumnEditMode={() => setIsColumnEditMode((prev) => !prev)}
      />

      {error && <div className="text-xs text-red-600">{error}</div>}

      <RefundRequestGrid
        rows={rows}
        columns={columns}
        isColumnEditMode={isColumnEditMode}
        onRowsChange={setRows}
        onColumnsChange={handleColumnsChange}
        onFieldSave={handleFieldSave}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
      />
    </div>
  );
}
