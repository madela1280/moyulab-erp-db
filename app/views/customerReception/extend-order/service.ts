// app/views/customerReception/extend-order/service.ts
//
// 연장·연체료 그리드 데이터 조회/삭제, 열 순서/너비 설정 조회/저장.
// ERP 자체 API를 호출한다(같은 DB라 CS서버를 거치지 않음).

import { type ExtendOrderRow } from "@/views/customerReception/extend-order/columns";

type ExtendOrderApiRow = {
  id: number;
  created_at: string | null;
  confirmed_at: string | null;
  status: string;
  customer_name: string | null;
  phone1: string | null;
  device_model: string | null;
  partner_category: string | null;
  extend_days: number | null;
  new_end_date: string | null;
  amount: number | null;
  depositor_name: string | null;
  actual_amount: number | null;
};

export async function fetchExtendOrders(): Promise<ExtendOrderRow[]> {
  const res = await fetch("/api/customer-reception/extend-orders", { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "연장·연체료 목록을 불러오지 못했습니다.");
  }

  const rows: ExtendOrderApiRow[] = Array.isArray(data.rows) ? data.rows : [];

  return rows.map((row) => ({
    id: String(row.id),
    status: row.status ?? "waiting",
    orderedAt: row.created_at ?? null,
    confirmedAt: row.confirmed_at ?? null,
    expectedAmount: row.amount ?? null,
    actualAmount: row.actual_amount ?? null,
    data: {
      customer_name: row.customer_name ?? "",
      phone1: row.phone1 ?? "",
      device_model: row.device_model ?? "",
      partner_category: row.partner_category ?? "",
      extend_days: row.extend_days != null ? String(row.extend_days) : "",
      new_end_date: row.new_end_date ?? "",
      amount: row.amount != null ? row.amount.toLocaleString("ko-KR") : "",
      depositor_name: row.depositor_name ?? "",
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
