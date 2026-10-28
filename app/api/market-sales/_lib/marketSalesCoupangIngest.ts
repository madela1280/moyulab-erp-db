// app/api/market-sales/_lib/marketSalesCoupangIngest.ts
//
// 쿠팡 매출내역 조회 API(coupangApiClient.ts) -> market_sales_data 저장 -> 이카운트 자동전송까지
// 한 번에 수행한다. 매일 아침 7시 스케줄러(아직 미구현, 다음 단계)에서 날짜만 바꿔서 호출할 예정.
//
// ⚠️ 수량/단가 계산 방식(중요, 사용자 확인 필요):
//    "기본수량"(세트 옵션 1회 구매당 실제 물리 수량, 예: 2세트=2개)을 감안해서
//    - 수량(최종) = 쿠팡 판매량(quantity 합계) × 기본수량
//    - 단가(최종) = 쿠팡 매출(saleAmount 합계) ÷ 수량(최종)   ← 판매량이 아니라 "최종 수량"으로 나눔
//    처음 합의했던 "단가 = 매출 ÷ 판매량"을 그대로 쓰면, 기본수량>1인 세트상품(SET0011/13/16/17)은
//    수량만 배로 늘고 단가는 그대로라서 이카운트 전송 시 공급가액이 실제 매출의 배수로 부풀려진다
//    (예: 2세트 옵션 190개 팔림, 매출 4,997,000원 → 판매량 기준 단가 26,300원인데 수량은 380개가 되어
//    380×26,300=9,994,000원으로 실제 매출의 거의 2배가 전송됨). 그래서 수량×단가 = 실제 매출이 되도록
//    단가 쪽을 "최종 수량"으로 나누게 바꿨다. 이 부분은 실제 테스트 전송해보고 꼭 재확인 필요.

import { query } from "@/lib/db";
import { getCoupangCredentials, fetchCoupangRevenueHistory } from "@/api/market-sales/_lib/coupangApiClient";
import { matchMarketSalesItem } from "@/api/market-sales/_lib/marketSalesProductMatcher";
import { registerEcountSale } from "@/api/lotte-shipment/_lib/ecountSaveSale";
import { CHANNEL_CUST, CHANNEL_WH_CD, type MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";
import { toEcountIoDate } from "@/api/market-sales/_lib/marketSalesDate";

export type IngestResult =
  | {
      ok: true;
      date: string;
      insertedOrUpdated: number;
      autoSentCount: number;
      autoSkippedCount: number;
      refundCount: number;
    }
  | { ok: false; reason: string };

type Aggregated = {
  vendorItemId: string;
  vendorItemName: string;
  qtySum: number;
  saleAmountSum: number;
};

export async function ingestCoupangSalesForDate(channel: MarketSalesChannel, date: string): Promise<IngestResult> {
  const creds = getCoupangCredentials(channel);
  if (!creds) return { ok: false, reason: "CREDENTIALS_NOT_CONFIGURED" };

  const fetchResult = await fetchCoupangRevenueHistory(creds, date, date);
  if (!fetchResult.ok) return { ok: false, reason: fetchResult.reason };

  let refundCount = 0;
  const aggByVendorItem = new Map<string, Aggregated>();

  for (const entry of fetchResult.entries) {
    if (entry.saleType !== "SALE") {
      refundCount++;
      continue; // ⚠️ 환불(REFUND) 건은 지금 단계에서 반영 안 함 — 별도 처리 필요(차감 로직 미구현).
    }
    for (const item of entry.items) {
      const prev = aggByVendorItem.get(item.vendorItemId);
      if (prev) {
        prev.qtySum += item.quantity;
        prev.saleAmountSum += item.saleAmount;
      } else {
        aggByVendorItem.set(item.vendorItemId, {
          vendorItemId: item.vendorItemId,
          vendorItemName: item.vendorItemName,
          qtySum: item.quantity,
          saleAmountSum: item.saleAmount,
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
    const supplyAmt = agg.saleAmountSum; // 쿠팡 saleAmount 합계를 공급가액으로 그대로 사용(반올림 오차 없음)
    const vatAmt = Math.round(supplyAmt * 0.1);
    const totalAmt = supplyAmt + vatAmt;

    const itemCode = matched?.PROD_CD || "";
    const itemName = matched?.NAME || "";
    const ecountStatus = matched ? "미전송" : "미매핑";
    const externalId = `${date}:${agg.vendorItemId}`;

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
      [channel, externalId, date, agg.vendorItemName, itemCode, itemName, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus]
    );
    insertedOrUpdated++;

    if (!matched || !cust) {
      autoSkippedCount++;
      continue;
    }

    // ✅ 수집 직후 바로 이카운트 자동전송 시도(이미 전송완료된 건은 건드리지 않음).
    const existing = await query(
      `SELECT ecount_status FROM market_sales_data WHERE channel = $1 AND external_id = $2`,
      [channel, externalId]
    );
    if (existing.rows?.[0]?.ecount_status === "전송완료") continue;

    const result = await registerEcountSale({
      cust,
      whCd,
      lines: [{ PROD_CD: itemCode, QTY: finalQty, PRICE: unitPrice }],
      ioDate: toEcountIoDate(date),
    });
    if (!result.ok || !result.slipNos.length) {
      console.error(`market-sales 자동수집 이카운트 전송 실패(channel=${channel}, externalId=${externalId}):`, !result.ok ? result.reason : "슬립번호 없음");
      autoSkippedCount++;
      continue;
    }

    await query(
      `UPDATE market_sales_data SET ecount_status = '전송완료', ecount_slip_no = $3 WHERE channel = $1 AND external_id = $2`,
      [channel, externalId, result.slipNos.join(",")]
    );
    autoSentCount++;
  }

  return { ok: true, date, insertedOrUpdated, autoSentCount, autoSkippedCount, refundCount };
}
