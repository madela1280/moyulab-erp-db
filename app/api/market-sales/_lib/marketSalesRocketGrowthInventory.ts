// app/api/market-sales/_lib/marketSalesRocketGrowthInventory.ts
//
// 로켓창고 재고 API -> market_sales_data.stock_qty 반영 ("로켓재고" 컬럼, 제이컴퍼니 전용).
// 2026-10-28 사용자 확인: 재고는 이카운트 전송과 완전히 무관한 단순 체크용 — qty/금액은 절대 안 건드림.
// ⚠️ 2026-10-28 추가 확인: 재고행은 매출행과 항상 분리되어야 한다(같은 날짜/품목이어도 절대 합치지 않음).
//    그래서 매출행(external_id = date:vendorItemId 또는 RG:date:vendorItemId)은 절대 건드리지 않고,
//    항상 재고 전용 행(external_id = STOCK:date:PROD_CD)만 upsert한다 — 수량 0, 금액 0 고정.

import { query } from "@/lib/db";
import { getCoupangCredentials, fetchCoupangRocketGrowthInventory } from "@/api/market-sales/_lib/coupangApiClient";
import { getProductGroupsForChannel } from "@/api/market-sales/_lib/marketSalesProductMatcher";
import type { MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";
import { ensureMarketSalesTables } from "@/api/market-sales/_lib/marketSalesService";

export type StockIngestResult =
  | { ok: true; date: string; updatedRows: number; insertedPlaceholders: number }
  | { ok: false; reason: string };

// date: "YYYY-MM-DD" — 재고는 날짜 개념이 없는 현재 시점 스냅샷이지만, 그리드 행은 날짜별로 있으므로
// 어느 날짜 행에 반영할지 지정해서 호출한다(보통 당일).
export async function ingestCoupangRocketGrowthStock(
  channel: MarketSalesChannel,
  date: string
): Promise<StockIngestResult> {
  if (channel !== "coupang_jcompany") return { ok: false, reason: "NOT_SUPPORTED_FOR_CHANNEL" };

  await ensureMarketSalesTables();

  const creds = getCoupangCredentials(channel);
  if (!creds) return { ok: false, reason: "CREDENTIALS_NOT_CONFIGURED" };

  const invResult = await fetchCoupangRocketGrowthInventory(creds);
  if (!invResult.ok) return { ok: false, reason: invResult.reason };

  const stockByVendorItem = new Map<string, number>();
  for (const it of invResult.items) stockByVendorItem.set(it.vendorItemId, it.totalOrderableQuantity);

  const groups = getProductGroupsForChannel(channel);

  let upserted = 0;

  for (const group of groups) {
    const stockSum = group.vendorItemIds.reduce((sum, id) => sum + (stockByVendorItem.get(id) || 0), 0);

    const externalId = `STOCK:${date}:${group.PROD_CD}`;
    await query(
      `
      INSERT INTO market_sales_data
        (channel, external_id, sale_date, market_item_name, item_code, item_name, qty, unit_price, supply_amt, vat_amt, total_amt, ecount_status, stock_qty)
      VALUES ($1,$2,$3,'',$4,$5,0,0,0,0,0,'미전송',$6)
      ON CONFLICT (channel, external_id) WHERE external_id IS NOT NULL DO UPDATE SET stock_qty = EXCLUDED.stock_qty
      `,
      [channel, externalId, date, group.PROD_CD, group.NAME, stockSum]
    );
    upserted++;
  }

  return { ok: true, date, updatedRows: 0, insertedPlaceholders: upserted };
}
