// app/views/customerReception/packaging-order/service.ts
//
// 포장재구매 그리드 데이터 조회/삭제, 열 순서/너비 설정 조회/저장.
// ERP 자체 API를 호출한다(같은 DB라 CS서버를 거치지 않음).

import {
  DEFAULT_BOX_COUNT,
  DEFAULT_MEMO,
  type PackagingOrderRow,
} from "@/views/customerReception/packaging-order/columns";

type PackagingOrderApiRow = {
  id: number;
  renter_name: string | null;
  phone1: string | null;
  phone2: string | null;
  shipping_address: string | null;
  item_name: string | null;
  amount: number | null;
  status: string;
  created_at: string | null;
  confirmed_at: string | null;
  actual_amount: number | null;
};

export async function fetchPackagingOrders(): Promise<PackagingOrderRow[]> {
  const res = await fetch("/api/customer-reception/packaging-orders", { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "포장재구매 목록을 불러오지 못했습니다.");
  }

  const rows: PackagingOrderApiRow[] = Array.isArray(data.rows) ? data.rows : [];

  return rows.map((row) => ({
    id: String(row.id),
    status: row.status ?? "waiting",
    orderedAt: row.created_at ?? null,
    confirmedAt: row.confirmed_at ?? null,
    expectedAmount: row.amount ?? null,
    actualAmount: row.actual_amount ?? null,
    data: {
      renter_name: row.renter_name ?? "",
      phone1: row.phone1 ?? "",
      phone2: row.phone2 ?? "",
      shipping_address: row.shipping_address ?? "",
      item_name: row.item_name ?? "",
      // 박스수량/메모는 카톡 데이터가 아니라 직원이 직접 채우는 칸 — 기본값만 미리 채워둔다(수정 가능)
      boxCount: DEFAULT_BOX_COUNT,
      memo: DEFAULT_MEMO,
    },
  }));
}

export async function deletePackagingOrders(ids: string[]): Promise<void> {
  const numericIds = ids.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0);
  if (!numericIds.length) return;

  const res = await fetch("/api/customer-reception/packaging-orders", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: numericIds }),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || "삭제하지 못했습니다.");
  }
}

export type PackagingOrderGridSettings = {
  columnOrder: string[];
  columnWidths: Record<string, number>;
};

export async function fetchPackagingOrderGridSettings(): Promise<PackagingOrderGridSettings> {
  try {
    const res = await fetch("/api/customer-reception/packaging-orders/grid-settings", { cache: "no-store" });
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

export async function savePackagingOrderGridSettings(
  columnOrder?: string[],
  columnWidths?: Record<string, number>
): Promise<void> {
  try {
    await fetch("/api/customer-reception/packaging-orders/grid-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnOrder, columnWidths }),
    });
  } catch {
    // 열 설정 저장 실패는 조용히 무시(그리드 사용 자체를 막을 정도의 문제는 아님)
  }
}
