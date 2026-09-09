"use client";

// app/views/customerReception/ExtendOrderView.tsx
//
// 고객접수 > 연장·연체료. 카카오 챗봇으로 접수된 연장/연체료 정산 요청을 그리드로 보여준다.
// PackagingOrderView.tsx와 같은 그리드 조작(열 이동, 영역지정 복사/삭제)을 제공한다.
// (기존 "입금확인" 화면은 삭제하고 이 화면으로 교체했다 — 2026-09-08)
//
// 추가 기능:
// - "확인" 체크박스로 선택한 행을 "삭제" 버튼(시그니처 블루)으로 일괄 삭제(끝내 입금 안 한 대기 건 정리용)
// - "전송" 버튼(초록): 선택한 "입금확정" 건을 통합관리 n차연장(비어있는 첫 칸)에 연장일수/결제수단/
//   금액/입금일자로 기록하고 종료일을 재계산, 특이사항1도 함께 전송. sync-engine.ts의 syncPatch만
//   사용해서 브라우저에서 직접 통합관리를 갱신한다(코어 파일은 건드리지 않음). 전송 성공 건은
//   payment_orders.unified_synced_at이 채워져서 "전송" 버튼이 다시 눌려도 서버(PATCH)가 막는다
//   (중복전송 방지 — n차연장이 계속 쌓여 종료일이 무한정 늘어나는 사고 예방).
// - "입금확인" 컬럼 헤더의 ▲▼로 입금확정/확인필요/입금대기 그룹 정렬(반복 클릭 시 반대로)
// - 열 순서/너비를 grid-settings API에 저장해 새로고침/재방문 후에도 유지
//
// ⚠ 자동전송(입금확정되면 사람 개입 없이 자동으로 위 전송을 수행하는 기능)은 아직 미구현 —
//   지금은 "전송" 버튼으로 수동 실행만 한다. 다음 단계에서 이 화면의 폴링에 자동 트리거를 붙일 예정.

import { useEffect, useMemo, useRef, useState } from "react";
import ExtendOrderHeader from "@/views/customerReception/extend-order/ExtendOrderHeader";
import ExtendOrderGrid, {
  type ExtendOrderSortMode,
} from "@/views/customerReception/extend-order/ExtendOrderGrid";
import {
  fetchExtendOrders,
  deleteExtendOrders,
  markExtendOrderSynced,
  fetchExtendOrderGridSettings,
  saveExtendOrderGridSettings,
  type ExtendOrderGridSettings,
} from "@/views/customerReception/extend-order/service";
import {
  EXTEND_ORDER_COLUMNS,
  getPaymentStatusLabel,
  getExtensionPaymentMethodLabel,
  type ExtendOrderColumn,
  type ExtendOrderRow,
} from "@/views/customerReception/extend-order/columns";
import { syncPatch } from "@/global-sync/sync-engine";
import { findFirstEmptyExtensionKey, sumExtensionDaysFromRow } from "@/views/unified/extensions/extensionCompute";
import { computeEndDateFromStartAndTotalDays } from "@/views/unified/extensions/extensionDate";
import { formatExtensionCell } from "@/views/unified/extensions/extensionFormat";

function applyGridSettings(
  baseColumns: ExtendOrderColumn[],
  settings: ExtendOrderGridSettings
): ExtendOrderColumn[] {
  let ordered = baseColumns;

  if (settings.columnOrder.length) {
    const byKey = new Map(baseColumns.map((col) => [col.key, col]));
    const seen = new Set<string>();
    const reordered: ExtendOrderColumn[] = [];

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

// 특이사항1은 직원이 전송 전에 직접 고쳐 쓰는 칸이라, 8초 폴링으로 서버값을 덮어써버리면
// 타이핑 중인 내용이 날아간다 — 폴링 때는 이 칸만 기존 화면 값을 그대로 보존한다.
const MANUAL_ONLY_KEYS = ["specialNote1"];

function mergePolledRows(freshRows: ExtendOrderRow[], prevRows: ExtendOrderRow[]): ExtendOrderRow[] {
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

/** 그리드에서 직접 고친 값(쉼표 포함 가능) 파싱 — 0 이하/파싱 실패면 null(원래 값으로 대체하라는 신호) */
function parsePositiveInt(v: string | undefined): number | null {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

function toDateOnly(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ExtendOrderView() {
  const [rows, setRows] = useState<ExtendOrderRow[]>([]);
  const [columns, setColumns] = useState<ExtendOrderColumn[]>(EXTEND_ORDER_COLUMNS);
  const [isColumnEditMode, setIsColumnEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<ExtendOrderSortMode>("none");

  const saveSettingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const nextRows = await fetchExtendOrders();
      setRows(nextRows);
      setSelectedIds(new Set());
    } catch (e: any) {
      setError(e?.message || "연장·연체료 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();

    (async () => {
      const settings = await fetchExtendOrderGridSettings();
      if (settings.columnOrder.length || Object.keys(settings.columnWidths).length) {
        setColumns((prev) => applyGridSettings(prev, settings));
      }
    })();
  }, []);

  // 카톡으로 새 접수가 들어오거나 SMS로 입금상태가 바뀌어도 새로고침 없이 화면에 반영되도록 주기적으로 갱신.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const nextRows = await fetchExtendOrders();
        setRows((prev) => mergePolledRows(nextRows, prev));
        setSelectedIds((prev) => {
          const stillExists = new Set(nextRows.map((r) => r.id));
          return new Set(Array.from(prev).filter((id) => stillExists.has(id)));
        });
      } catch {
        // 폴링 실패는 조용히 무시 — 다음 주기에 다시 시도
      }
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  // 정렬 우선순위: 입금확정(처리 다 끝난 건) 먼저 → 확인필요(직원이 봐야 하는 건) → 입금대기
  const STATUS_SORT_RANK: Record<string, number> = { 입금확정: 0, 확인필요: 1, 입금대기: 2 };

  const sortedRows = useMemo(() => {
    if (sortMode === "none") return rows;

    const withIndex = rows.map((row, index) => ({ row, index }));
    withIndex.sort((a, b) => {
      const aRank = STATUS_SORT_RANK[getPaymentStatusLabel(a.row.status)] ?? 3;
      const bRank = STATUS_SORT_RANK[getPaymentStatusLabel(b.row.status)] ?? 3;
      if (aRank === bRank) return a.index - b.index;
      const diff = aRank - bRank;
      return sortMode === "confirmed-first" ? diff : -diff;
    });
    return withIndex.map((w) => w.row);
  }, [rows, sortMode]);

  function handleColumnsChange(nextColumns: ExtendOrderColumn[]) {
    setColumns(nextColumns);

    if (saveSettingsTimer.current) clearTimeout(saveSettingsTimer.current);
    saveSettingsTimer.current = setTimeout(() => {
      const columnOrder = nextColumns.map((col) => col.key);
      const columnWidths = Object.fromEntries(nextColumns.map((col) => [col.key, col.width]));
      saveExtendOrderGridSettings(columnOrder, columnWidths);
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
    setSelectedIds(checked ? new Set(sortedRows.map((row) => row.id)) : new Set());
  }

  function handleToggleSort() {
    setSortMode((prev) => (prev === "confirmed-first" ? "waiting-first" : "confirmed-first"));
  }

  async function handleDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) return;

    setError("");
    try {
      await deleteExtendOrders(Array.from(selectedIds));
      await loadRows();
    } catch (e: any) {
      setError(e?.message || "삭제하지 못했습니다.");
    }
  }

  // 선택한 행 하나를 통합관리 n차연장에 기록. 실패 사유를 문자열로 반환(성공이면 null).
  async function sendOneRow(row: ExtendOrderRow): Promise<string | null> {
    const statusLabel = getPaymentStatusLabel(row.status);
    // 입금대기(아직 돈이 안 들어옴)만 막는다 — 확인필요(실입금액이 예정액과 다름)는 직원이
    // 실입금액을 보고 연장일수/금액을 맞게 고친 뒤 보낼 수 있어야 한다(대표님 지시, 2026-09-08).
    if (statusLabel === "입금대기") {
      return `${row.data?.customer_name || row.id}: 아직 입금 전(입금대기)이라 전송할 수 없습니다`;
    }
    if (row.unifiedSyncedAt) {
      return `${row.data?.customer_name || row.id}: 이미 전송된 건입니다`;
    }
    if (!row.unifiedId) {
      return `${row.data?.customer_name || row.id}: 통합관리 대여건을 찾을 수 없습니다`;
    }

    // 그리드에서 직접 고친 값(확인필요 건을 실입금액에 맞게 수정한 경우)을 우선 사용하고,
    // 수정이 없거나 파싱 실패하면 접수 당시 원래 값으로 되돌아간다.
    const editedDays = parsePositiveInt(row.data?.extend_days);
    const editedAmount = parsePositiveInt(row.data?.amount);
    const extendDaysToSend = editedDays ?? row.extendDays;
    const amountToSend = editedAmount ?? row.expectedAmount;

    if (!extendDaysToSend || !amountToSend) {
      return `${row.data?.customer_name || row.id}: 연장일수/금액 값이 올바르지 않습니다`;
    }

    const unifiedRes = await fetch(`/api/unified/${row.unifiedId}`, { cache: "no-store" });
    if (!unifiedRes.ok) return `${row.data?.customer_name || row.id}: 통합관리 조회 실패`;
    const unifiedJson = await unifiedRes.json().catch(() => null);
    const unifiedData = (unifiedJson?.data ?? {}) as Record<string, any>;

    const emptyKey = findFirstEmptyExtensionKey(unifiedData);
    if (!emptyKey) {
      return `${row.data?.customer_name || row.id}: 통합관리 1~15차연장 칸이 모두 차있어 전송할 수 없습니다`;
    }

    const cellText = formatExtensionCell({
      days: String(extendDaysToSend),
      paymentMethod: getExtensionPaymentMethodLabel(row.isOverdueSettlement),
      amount: String(amountToSend),
      receivedDate: toDateOnly(row.confirmedAt) || null,
    });

    await syncPatch(row.unifiedId, emptyKey, cellText);

    // 종료일 = 시작일 + (0차연장 + 1차~15차 연장일수 합) — 지금 막 채운 칸까지 포함해서 재계산
    const totalDays = sumExtensionDaysFromRow({ ...unifiedData, [emptyKey]: cellText });
    const nextEnd = computeEndDateFromStartAndTotalDays(String(unifiedData?.["시작일"] ?? ""), totalDays);
    if (nextEnd) {
      await syncPatch(row.unifiedId, "종료일", nextEnd);
    }

    const specialNote = row.data?.specialNote1 ?? "";
    if (specialNote.trim()) {
      await syncPatch(row.unifiedId, "특이사항1", specialNote.trim());
    }

    const marked = await markExtendOrderSynced(row.id);
    if (!marked.ok) {
      return `${row.data?.customer_name || row.id}: 통합관리엔 반영됐지만 전송완료 표시에 실패했습니다(${marked.error})`;
    }

    return null;
  }

  async function handleSend() {
    if (selectedIds.size === 0) return;

    const targets = sortedRows.filter((row) => selectedIds.has(row.id));
    if (!window.confirm(`선택한 ${targets.length}건을 통합관리 n차연장에 전송할까요?`)) return;

    setSending(true);
    setError("");

    const failures: string[] = [];
    for (const row of targets) {
      try {
        const failReason = await sendOneRow(row);
        if (failReason) failures.push(failReason);
      } catch (e: any) {
        failures.push(`${row.data?.customer_name || row.id}: ${e?.message || "전송 실패"}`);
      }
    }

    setSending(false);
    if (failures.length) setError(failures.join(" / "));
    await loadRows();
  }

  return (
    <div className="w-full h-full flex flex-col p-3 gap-3 bg-white">
      <ExtendOrderHeader
        loading={loading}
        isColumnEditMode={isColumnEditMode}
        hasSelection={selectedIds.size > 0}
        sending={sending}
        onRefresh={loadRows}
        onDelete={handleDelete}
        onSend={handleSend}
        onToggleColumnEditMode={() => setIsColumnEditMode((prev) => !prev)}
      />

      {error && <div className="text-xs text-red-600">{error}</div>}

      <ExtendOrderGrid
        rows={sortedRows}
        columns={columns}
        isColumnEditMode={isColumnEditMode}
        onRowsChange={setRows}
        onColumnsChange={handleColumnsChange}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
        sortMode={sortMode}
        onToggleSort={handleToggleSort}
      />
    </div>
  );
}
