// app/views/customerReception/extend-order/service.ts
//
// 연장·연체료 그리드 데이터 조회/삭제/전송완료표시, 열 순서/너비 설정 조회/저장.
// ERP 자체 API를 호출한다(같은 DB라 CS서버를 거치지 않음).

import { type ExtendOrderRow } from "@/views/customerReception/extend-order/columns";

type ExtendOrderApiRow = {
  id: number;
  unified_id: number | null;
  created_at: string | null;
  confirmed_at: string | null;
  status: string;
  customer_name: string | null;
  phone1: string | null;
  device_model: string | null;
  partner_category: string | null;
  device_no: string | null;
  unified_special_note1: string | null;
  extend_days: number | null;
  current_end_date: string | null;
  new_end_date: string | null;
  amount: number | null;
  depositor_name: string | null;
  is_overdue_settlement: boolean | null;
  unified_synced_at: string | null;
  actual_amount: number | null;
};

function normalizeName(v: unknown) {
  return String(v ?? "").trim();
}

/** 입금자명이 수취인명과 다르면 "특이사항1" 기본값으로 안내(직접 수정 가능) */
function buildDefaultSpecialNote(depositorName: string, customerName: string, unifiedNote: string) {
  if (unifiedNote) return unifiedNote; // 통합관리에 이미 적힌 값이 있으면 그대로 보여줌(덮어쓰지 않음)
  const d = normalizeName(depositorName);
  const c = normalizeName(customerName);
  if (!d || !c || d === c) return "";
  return `실입금자: ${d}`;
}

export async function fetchExtendOrders(): Promise<ExtendOrderRow[]> {
  const res = await fetch("/api/customer-reception/extend-orders", { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "연장·연체료 목록을 불러오지 못했습니다.");
  }

  const rows: ExtendOrderApiRow[] = Array.isArray(data.rows) ? data.rows : [];

  return rows.map((row) => ({
    id: String(row.id),
    unifiedId: row.unified_id ?? null,
    status: row.status ?? "waiting",
    orderedAt: row.created_at ?? null,
    confirmedAt: row.confirmed_at ?? null,
    currentEndDate: row.current_end_date ?? null,
    extendDays: row.extend_days ?? null,
    expectedAmount: row.amount ?? null,
    actualAmount: row.actual_amount ?? null,
    isOverdueSettlement: row.is_overdue_settlement === true,
    unifiedSyncedAt: row.unified_synced_at ?? null,
    data: {
      customer_name: row.customer_name ?? "",
      phone1: row.phone1 ?? "",
      device_model: row.device_model ?? "",
      partner_category: row.partner_category ?? "",
      device_no: row.device_no ?? "",
      extend_days: row.extend_days != null ? String(row.extend_days) : "",
      new_end_date: row.new_end_date ?? "",
      amount: row.amount != null ? row.amount.toLocaleString("ko-KR") : "",
      depositor_name: row.depositor_name ?? "",
      specialNote1: buildDefaultSpecialNote(row.depositor_name ?? "", row.customer_name ?? "", row.unified_special_note1 ?? ""),
    },
  }));
}

export async function deleteExtendOrders(ids: string[]): Promise<void> {
  const numericIds = ids.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0);
  if (!numericIds.length) return;

  const res = await fetch("/api/customer-reception/extend-orders", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: numericIds }),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "삭제하지 못했습니다.");
  }
}

/** 통합관리 n차연장 기록까지 끝난 뒤 이 결제건을 "전송완료"로 표시(중복전송 방지). */
export async function markExtendOrderSynced(id: string): Promise<{ ok: boolean; error?: string }> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return { ok: false, error: "invalid_id" };

  const res = await fetch("/api/customer-reception/extend-orders", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: numericId }),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || "server" };
  }
  return { ok: true };
}

export type ExtendOrderGridSettings = {
  columnOrder: string[];
  columnWidths: Record<string, number>;
};

export async function fetchExtendOrderGridSettings(): Promise<ExtendOrderGridSettings> {
  try {
    const res = await fetch("/api/customer-reception/extend-orders/grid-settings", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) return { columnOrder: [], columnWidths: {} };

    return {
      columnOrder: Array.isArray(data.columnOrder) ? data.columnOrder.map((v: unknown) => String(v)) : [],
      columnWidths:
        data.columnWidths && typeof data.columnWidths === "object" ? data.columnWidths : {},
    };
  } catch {
    return { columnOrder: [], columnWidths: {} };
  }
}

export async function saveExtendOrderGridSettings(
  columnOrder?: string[],
  columnWidths?: Record<string, number>
): Promise<void> {
  try {
    await fetch("/api/customer-reception/extend-orders/grid-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnOrder, columnWidths }),
    });
  } catch {
    // 열 설정 저장 실패는 조용히 무시(그리드 사용 자체를 막을 정도의 문제는 아님)
  }
}
