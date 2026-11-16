// app/api/market-sales/_lib/marketSalesRocketGrowthCancelSnapshot.ts
//
// 1단계(진단/데이터 수집 전용) — 로켓그로스 취소/반품을 직접 조회할 공식 API가 없어서(실확인됨:
// rg/orders에 상태값 없음, rg/returns·rg/cancels 404, 일반 반품API·발주서API는 로켓그로스 미포함),
// 대신 "최근 30일 순판매수량"(SALES_COUNT_LAST_THIRTY_DAYS)을 매일 찍어서 쌓아두는 용도.
// ⚠️ 이 단계는 market_sales_data(이카운트 전송 흐름)에 전혀 영향을 주지 않는다 — 별도 테이블에
//    기록만 한다. 최소 2~4주 쌓인 뒤 사용자가 준 Seller Insights 엑셀(Vendor Item Metrics)과
//    대조해서 정확도를 검증하고 나서(2단계), 실제 이카운트 보정전표 로직과 연결할 예정.

import { query } from "@/lib/db";
import { getCoupangCredentials, fetchCoupangRgInventorySummaries } from "@/api/market-sales/_lib/coupangApiClient";
import type { MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

let ensured = false;
async function ensureSnapshotTable() {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS market_sales_rg_sales_count_snapshot (
      channel TEXT NOT NULL,
      vendor_item_id TEXT NOT NULL,
      snapshot_date DATE NOT NULL,
      sales_count_last_30d INTEGER NOT NULL DEFAULT 0,
      total_orderable_qty INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (channel, vendor_item_id, snapshot_date)
    )
  `);
  ensured = true;
}

export type RgSnapshotResult =
  | { ok: true; date: string; itemCount: number }
  | { ok: false; reason: string };

// date: "YYYY-MM-DD" (보통 오늘, KST 기준 — 호출부에서 넘겨줌)
export async function captureCoupangRgSalesCountSnapshot(
  channel: MarketSalesChannel,
  date: string
): Promise<RgSnapshotResult> {
  await ensureSnapshotTable();

  const creds = getCoupangCredentials(channel);
  if (!creds) return { ok: false, reason: "CREDENTIALS_NOT_CONFIGURED" };

  const result = await fetchCoupangRgInventorySummaries(creds);
  if (!result.ok) return { ok: false, reason: result.reason };

  for (const item of result.items) {
    await query(
      `
      INSERT INTO market_sales_rg_sales_count_snapshot
        (channel, vendor_item_id, snapshot_date, sales_count_last_30d, total_orderable_qty)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (channel, vendor_item_id, snapshot_date) DO UPDATE SET
        sales_count_last_30d = EXCLUDED.sales_count_last_30d,
        total_orderable_qty = EXCLUDED.total_orderable_qty
      `,
      [channel, item.vendorItemId, date, item.salesCountLast30Days, item.totalOrderableQuantity]
    );
  }

  return { ok: true, date, itemCount: result.items.length };
}
