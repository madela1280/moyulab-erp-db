// app/api/market-sales/_lib/marketSalesRocketGrowthIngest.ts
//
// 쿠팡 로켓그로스 주문 API(결제일 기준) -> market_sales_data 저장 -> 이카운트 자동전송.
// 2026-10-28 사용자 확인: 로켓그로스도 ERP 화면/이카운트 거래처 모두 일반매출(coupang_jcompany)과
// 동일하게 합쳐서 쓴다 — 별도 채널/탭 아님. external_id에 "RG:" 접두어만 붙여서 구분한다.
// ⚠️ 날짜 기준이 일반매출(매출인식일)과 다르다 — 로켓그로스는 결제일(paidDate) 기준.
//    상품매칭은 같은 매칭표(marketSalesProductMatcher.ts)를 그대로 쓴다(같은 사업자, 같은 옵션ID 체계).

import { query } from "@/lib/db";
import { getCoupangCredentials, fetchCoupangRocketGrowthOrders } from "@/api/market-sales/_lib/coupangApiClient";
import { matchMarketSalesItem } from "@/api/market-sales/_lib/marketSalesProductMatcher";
import { registerEcountSale } from "@/api/lotte-shipment/_lib/ecountSaveSale";
import { CHANNEL_CUST, CHANNEL_WH_CD, type MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";
import { toEcountIoDate } from "@/api/market-sales/_lib/marketSalesDate";

export type RocketGrowthIngestResult =
  | { ok: true; date: string; insertedOrUpdated: number; autoSentCount: number; autoSkippedCount: number }
  | { ok: false; reason: string };

type Aggregated = { vendorItemId: string; productName: string; qtySum: number; saleAmountSum: number };

// date: "YYYY-MM-DD" (결제일 기준 하루치)
export async function ingestCoupangRocketGrowthSalesForDate(
  channel: MarketSalesChannel,
  date: string
): Promise<RocketGrowthIngestResult> {
  const creds = getCoupangCredentials(channel);
  if (!creds) return { ok: false, reason: "CREDENTIALS_NOT_CONFIGURED" };

  const paidDate = toEcountIoDate(date); // yyyymmdd
  if (!paidDate) return { ok: false, reason: "INVALID_DATE" };

  const fetchResult = await fetchCoupangRocketGrowthOrders(creds, paidDate, paidDate);
  if (!fetchResult.ok) return { ok: false, reason: fetchResult.reason };

  const aggByVendorItem = new Map<string, Aggregated>();
  for (const entry of fetchResult.entries) {
    for (const item of entry.orderItems) {
      const prev = aggByVendorItem.get(item.vendorItemId);
      const lineAmount = item.salesQuantity * item.unitSalesPrice;
      if (prev) {
        prev.qtySum += item.salesQuantity;
        prev.saleAmountSum += lineAmount;
      } else {
        aggByVendorItem.set(item.vendorItemId, {
          vendorItemId: item.vendorItemId,
          productName: item.productName,
          qtySum: item.salesQuantity,
          saleAmountSum: lineAmount,
        });
      }
    }
  }

  const cust = CHANNEL_CUST[channel];
  const whCd = CHANNEL_WH_CD[channel];

  let insertedOrUpdated = 0;
  let autoSentCount = 0;
  let autoSkippedCount = 0;

  for (const agg of aggByVendorItem.values()) {
    const matched = matchMarketSalesItem(channel, agg.vendorItemId);
    const baseQty = matched?.baseQty || 1;

    const finalQty = agg.qtySum * baseQty;
    const unitPrice = finalQty > 0 ? Math.round(agg.saleAmountSum / finalQty) : 0;
    const supplyAmt = agg.saleAmountSum;
    const vatAmt = Math.round(supplyAmt * 0.1);
    const totalAmt = supplyAmt + vatAmt;

    const itemCode = matched?.PROD_CD || "";
    const itemName = matched?.NAME || "";
    const ecountStatus = matched ? "미전송" : "미매핑";
    const externalId = `RG:${date}:${agg.vendorItemId}`;

    await query(
      `
      INSERT INTO market_sales_data
        (channel, external_id, sale_date, market_item_name, item_code, item_name, qty, unit_price, supply_amt, vat_amt, total_amt, ecount_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (channel, external_id) WHERE external_id IS NOT NULL DO UPDATE SET
        market_item_name = EXCLUDED.market_item_name,
        qty = EXCLUDED.qty,
        unit_price = EXCLUDED.unit_price,
        supply_amt = EXCLUDED.supply_amt,
        vat_amt = EXCLUDED.vat_amt,
        total_amt = EXCLUDED.total_amt
      WHERE market_sales_data.ecount_status != '전송완료'
      `,
      [channel, externalId, date, agg.productName, itemCode, itemName, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus]
    );
    insertedOrUpdated++;

    if (!matched || !cust) {
      autoSkippedCount++;
      continue;
    }

    const existing = await query(
      `SELECT ecount_status FROM market_sales_data WHERE channel = $1 AND external_id = $2`,
      [channel, externalId]
    );
    if (existing.rows?.[0]?.ecount_status === "전송완료") continue;

    const result = await registerEcountSale({
      cust,
      whCd,
      lines: [{ PROD_CD: itemCode, QTY: finalQty, PRICE: unitPrice }],
      ioDate: paidDate,
    });
    if (!result.ok || !result.slipNos.length) {
      console.error(`market-sales 로켓그로스 자동전송 실패(channel=${channel}, externalId=${externalId}):`, !result.ok ? result.reason : "슬립번호 없음");
      autoSkippedCount++;
      continue;
    }

    await query(
      `UPDATE market_sales_data SET ecount_status = '전송완료', ecount_slip_no = $3 WHERE channel = $1 AND external_id = $2`,
      [channel, externalId, result.slipNos.join(",")]
    );
    autoSentCount++;
  }

  return { ok: true, date, insertedOrUpdated, autoSentCount, autoSkippedCount };
}
