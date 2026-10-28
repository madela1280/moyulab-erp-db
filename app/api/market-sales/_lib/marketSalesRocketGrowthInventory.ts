// app/api/market-sales/_lib/marketSalesRocketGrowthInventory.ts
//
// 로켓창고 재고 API -> market_sales_data.stock_qty 반영 ("로켓재고" 컬럼, 제이컴퍼니 전용).
// 2026-10-28 사용자 확인: 재고는 이카운트 전송과 완전히 무관한 단순 체크용 — qty/금액은 절대 안 건드림.
// 같은 날짜에 그 PROD_CD로 매출 행이 이미 있으면 그 행(들)에 재고만 채워넣고, 없으면
// 수량 0짜리 "재고 확인용" 행을 새로 만든다(품목코드/품목명은 표시, 수량/금액은 0).

import { query } from "@/lib/db";
import { getCoupangCredentials, fetchCoupangRocketGrowthInventory } from "@/api/market-sales/_lib/coupangApiClient";
import { getProductGroupsForChannel } from "@/api/market-sales/_lib/marketSalesProductMatcher";
import type { MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

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

  const creds = getCoupangCredentials(channel);
  if (!creds) return { ok: false, reason: "CREDENTIALS_NOT_CONFIGURED" };

  const invResult = await fetchCoupangRocketGrowthInventory(creds);
  if (!invResult.ok) return { ok: false, reason: invResult.reason };

  const stockByVendorItem = new Map<string, number>();
  for (const it of invResult.items) stockByVendorItem.set(it.vendorItemId, it.totalOrderableQuantity);

  const groups = getProductGroupsForChannel(channel);

  let updatedRows = 0;
  let insertedPlaceholders = 0;

  for (const group of groups) {
    const stockSum = group.vendorItemIds.reduce((sum, id) => sum + (stockByVendorItem.get(id) || 0), 0);

    const updateResult = await query(
      `UPDATE market_sales_data SET stock_qty = $4 WHERE channel = $1 AND sale_date = $2 AND item_code = $3`,
      [channel, date, group.PROD_CD, stockSum]
    );
    if ((updateResult.rowCount || 0) > 0) {
      updatedRows += updateResult.rowCount || 0;
      continue;
    }

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
    insertedPlaceholders++;
  }

  return { ok: true, date, updatedRows, insertedPlaceholders };
}
