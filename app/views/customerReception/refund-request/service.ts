// app/views/customerReception/refund-request/service.ts
//
// 환불접수 그리드 데이터 조회/수정/삭제. ERP 자체 API(/api/customer-reception/refund-requests)를
// 호출한다 — 그 API가 내부적으로 CS서버를 대신 호출한다(반납접수와 동일 원칙).

import { type RefundRequestRow } from "@/views/customerReception/refund-request/columns";

type RefundRequestApiRow = {
  id: number;
  renter_name: string | null;
  product: string | null;
  phone: string | null;
  partner_category: string | null;
  device_no: string | null;
  contract_address: string | null;
  start_date: string | null;
  end_date: string | null;
  pickup_preferred_date: string | null;
  refund_amount: number | null;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  payment_status: string | null;
  parts_note: string | null;
  memo: string | null;
  received_at: string | null;
};

export async function fetchRefundRequests(): Promise<RefundRequestRow[]> {
  const res = await fetch("/api/customer-reception/refund-requests", { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "환불접수 목록을 불러오지 못했습니다.");
  }

  const rows: RefundRequestApiRow[] = Array.isArray(data.rows) ? data.rows : [];

  return rows.map((row) => ({
    id: String(row.id),
    receivedAt: row.received_at ?? null,
    data: {
      partner_category: row.partner_category ?? "",
      device_no: row.device_no ?? "",
      product: row.product ?? "",
      renter_name: row.renter_name ?? "",
      phone: row.phone ?? "",
      contract_address: row.contract_address ?? "",
      start_date: row.start_date ?? "",
      end_date: row.end_date ?? "",
      pickup_preferred_date: row.pickup_preferred_date ?? "",
      refund_amount: row.refund_amount != null ? row.refund_amount.toLocaleString("ko-KR") : "",
      bank_name: row.bank_name ?? "",
      account_holder: row.account_holder ?? "",
      account_number: row.account_number ?? "",
      payment_status: row.payment_status || "반품전",
      parts_note: row.parts_note ?? "",
      memo: row.memo ?? "",
    },
  }));
}

export async function updateRefundRequestField(id: string, field: string, value: string): Promise<void> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return;

  const res = await fetch("/api/customer-reception/refund-requests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: numericId, field, value }),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "저장하지 못했습니다.");
  }
}

export async function deleteRefundRequests(ids: string[]): Promise<void> {
  const numericIds = ids.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0);
  if (!numericIds.length) return;

  const res = await fetch("/api/customer-reception/refund-requests", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: numericIds }),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "삭제하지 못했습니다.");
  }
}

export type RefundRequestGridSettings = {
  columnOrder: string[];
  columnWidths: Record<string, number>;
};

export async function fetchRefundRequestGridSettings(): Promise<RefundRequestGridSettings> {
  try {
    const res = await fetch("/api/customer-reception/refund-requests/grid-settings", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) return { columnOrder: [], columnWidths: {} };

    return {
      columnOrder: Array.isArray(data.columnOrder) ? data.columnOrder.map((v: unknown) => String(v)) : [],
      columnWidths: data.columnWidths && typeof data.columnWidths === "object" ? data.columnWidths : {},
    };
  } catch {
    return { columnOrder: [], columnWidths: {} };
  }
}

export async function saveRefundRequestGridSettings(
  columnOrder?: string[],
  columnWidths?: Record<string, number>
): Promise<void> {
  try {
    await fetch("/api/customer-reception/refund-requests/grid-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnOrder, columnWidths }),
    });
  } catch {
    // 열 설정 저장 실패는 조용히 무시
  }
}
