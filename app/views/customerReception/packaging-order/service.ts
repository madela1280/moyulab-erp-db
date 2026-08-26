// app/views/customerReception/packaging-order/service.ts
//
// 포장재구매 그리드 데이터 조회. ERP 자체 API를 호출한다(같은 DB라 CS서버를 거치지 않음).

import type { PackagingOrderRow } from "@/views/customerReception/packaging-order/columns";

type PackagingOrderApiRow = {
  id: number;
  renter_name: string | null;
  phone1: string | null;
  phone2: string | null;
  shipping_address: string | null;
  item_name: string | null;
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
    data: {
      renter_name: row.renter_name ?? "",
      phone1: row.phone1 ?? "",
      phone2: row.phone2 ?? "",
      shipping_address: row.shipping_address ?? "",
      item_name: row.item_name ?? "",
    },
  }));
}
