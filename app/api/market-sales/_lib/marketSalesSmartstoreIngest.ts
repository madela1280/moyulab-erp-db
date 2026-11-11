// app/api/market-sales/_lib/marketSalesSmartstoreIngest.ts
//
// 네이버 커머스API(naverApiClient.ts) 상품주문 조회 -> market_sales_data 저장 -> 이카운트
// 자동전송까지 한 번에 수행. 쿠팡 ingest(marketSalesCoupangIngest.ts)와 동일한 "증분 upsert +
// 전송완료 건은 델타로만 추가" 구조를 그대로 따른다(중복전송 방지 설계도 동일).
//
// ⚠️ 매출액은 productOrder.totalProductAmount(상품금액, 배송비 제외) 기준 — 실제 테스트 전송
//    후 꼭 재확인 필요(쿠팡 때와 동일하게 추측 아님, 공식 문서 필드지만 실데이터 검증은 아직 못함).
// ✅ 2026-11-11: 집계/매칭 키는 productId 단독이 아니라 "productId|productOption" 조합 — 같은
//    productId라도 옵션(productOption)별로 완전히 다른 물리 품목으로 매핑되는 경우가 실제
//    매핑자료(스마트스토어_일반상품매핑xlsx.xlsx, 175건)에서 다수 확인됨. 옵션이 없는 단품은
//    productId만 키로 쓴다. 네이버상품명(마켓상품명) 표시도 "상품명/옵션정보" 조합으로 저장.

import { query } from "@/lib/db";
import { getNaverCredentials, fetchNaverProductOrders } from "@/api/market-sales/_lib/naverApiClient";
import { matchMarketSalesItem } from "@/api/market-sales/_lib/marketSalesProductMatcher";
import { registerEcountSale } from "@/api/lotte-shipment/_lib/ecountSaveSale";
import { CHANNEL_CUST, CHANNEL_WH_CD, type MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";
import { toEcountIoDate, toKstIsoDayRange, epochMsToKstDateString } from "@/api/market-sales/_lib/marketSalesDate";
import { ensureMarketSalesTables } from "@/api/market-sales/_lib/marketSalesService";

export type IngestResult =
  | { ok: true; date: string; insertedOrUpdated: number; autoSentCount: number; autoSkippedCount: number }
  | { ok: false; reason: string };

type Aggregated = {
  saleDate: string;
  matchKey: string; // "productId|productOption"(옵션 없으면 productId만) — 매칭/external_id 공용 키
  displayName: string; // "상품명/옵션정보"(옵션 없으면 상품명만) — market_item_name 표시용
  qtySum: number;
  amountSum: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ingestSmartstoreSalesForDate(channel: MarketSalesChannel, date: string): Promise<IngestResult> {
  await ensureMarketSalesTables();

  const creds = getNaverCredentials(channel);
  if (!creds) return { ok: false, reason: "CREDENTIALS_NOT_CONFIGURED" };

  const { fromISO, toISO } = toKstIsoDayRange(date);
  const fetchResult = await fetchNaverProductOrders(creds, fromISO, toISO);
  if (!fetchResult.ok) return { ok: false, reason: fetchResult.reason };

  const aggByKey = new Map<string, Aggregated>();

  for (const entry of fetchResult.data) {
    if (!entry.productId) continue;
    // ✅ 결제일시(paymentDate)를 실제 매출일로 사용 — 쿠팡처럼 조회일과 실제 판매일이 어긋나는
    //    문제가 없다(요청 자체가 결제일시 범위 기준이라 어긋날 수 없음). 방어적으로 KST 날짜만 추출.
    const saleDate = entry.paymentDate ? epochMsToKstDateString(Date.parse(entry.paymentDate)) : date;

    const option = (entry.productOption || "").trim();
    const matchKey = option ? `${entry.productId}|${option}` : entry.productId;
    const displayName = option ? `${entry.productName}/${option}` : entry.productName;

    const key = `${saleDate}|${matchKey}`;
    const prev = aggByKey.get(key);
    if (prev) {
      prev.qtySum += entry.quantity;
      prev.amountSum += entry.totalProductAmount;
    } else {
      aggByKey.set(key, {
        saleDate,
        matchKey,
        displayName,
        qtySum: entry.quantity,
        amountSum: entry.totalProductAmount,
      });
    }
  }

  const cust = CHANNEL_CUST[channel];
  const whCd = CHANNEL_WH_CD[channel];

  let insertedOrUpdated = 0;
  let autoSentCount = 0;
  let autoSkippedCount = 0;
  let isFirstSend = true;

  // ✅ 쿠팡 ingest와 동일한 증분 upsert — 이미 전송완료 상태면 아무것도 바뀌지 않는다(WHERE 조건).
  async function upsertIncrement(
    externalId: string,
    saleDate: string,
    agg: Aggregated,
    finalQty: number,
    unitPrice: number,
    supplyAmt: number,
    vatAmt: number,
    totalAmt: number,
    ecountStatus: string
  ) {
    return query(
      `
      INSERT INTO market_sales_data
        (channel, external_id, sale_date, market_item_name, item_code, item_name, qty, unit_price, supply_amt, vat_amt, total_amt, ecount_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (channel, external_id) WHERE external_id IS NOT NULL DO UPDATE SET
        market_item_name = EXCLUDED.market_item_name,
        qty = market_sales_data.qty + EXCLUDED.qty,
        supply_amt = market_sales_data.supply_amt + EXCLUDED.supply_amt,
        vat_amt = market_sales_data.vat_amt + EXCLUDED.vat_amt,
        total_amt = market_sales_data.total_amt + EXCLUDED.total_amt,
        unit_price = CASE WHEN (market_sales_data.qty + EXCLUDED.qty) > 0
                      THEN ROUND((market_sales_data.supply_amt + EXCLUDED.supply_amt) / (market_sales_data.qty + EXCLUDED.qty))
                      ELSE 0 END
      WHERE market_sales_data.ecount_status != '전송완료'
      RETURNING id
      `,
      [channel, externalId, saleDate, agg.displayName, "", "", finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus]
    );
  }

  for (const agg of aggByKey.values()) {
    const matched = matchMarketSalesItem(channel, agg.matchKey);
    const baseQty = matched?.baseQty || 1;

    const finalQty = agg.qtySum * baseQty;
    const unitPrice = finalQty > 0 ? Math.round(agg.amountSum / finalQty) : 0;
    const supplyAmt = agg.amountSum;
    const vatAmt = Math.round(supplyAmt * 0.1);
    const totalAmt = supplyAmt + vatAmt;

    const itemCode = matched?.PROD_CD || "";
    const itemName = matched?.NAME || "";
    const ecountStatus = matched ? "미전송" : "미매핑";
    const externalId = `${agg.saleDate}:${agg.matchKey}`;

    const upsertResult = await upsertIncrement(externalId, agg.saleDate, agg, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus);

    let targetExternalId = externalId;
    if (upsertResult.rowCount === 0) {
      const deltaExternalId = `${externalId}+${date}`;
      await upsertIncrement(deltaExternalId, agg.saleDate, agg, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus);
      targetExternalId = deltaExternalId;
    }

    await query(
      `UPDATE market_sales_data SET item_code = $3, item_name = $4, ecount_status = $5
       WHERE channel = $1 AND external_id = $2 AND item_code = ''`,
      [channel, targetExternalId, itemCode, itemName, ecountStatus]
    );
    insertedOrUpdated++;

    if (!matched || !cust) {
      autoSkippedCount++;
      continue;
    }

    const existing = await query(
      `SELECT qty, unit_price, ecount_status FROM market_sales_data WHERE channel = $1 AND external_id = $2`,
      [channel, targetExternalId]
    );
    const row = existing.rows?.[0];
    if (!row || row.ecount_status === "전송완료") continue;

    if (!isFirstSend) await sleep(3000);
    isFirstSend = false;

    const result = await registerEcountSale({
      cust,
      whCd,
      lines: [{ PROD_CD: itemCode, QTY: Number(row.qty), PRICE: Number(row.unit_price) }],
      ioDate: toEcountIoDate(agg.saleDate),
    });
    if (!result.ok || !result.slipNos.length) {
      console.error(`market-sales(스마트스토어) 자동수집 이카운트 전송 실패(channel=${channel}, externalId=${targetExternalId}):`, !result.ok ? result.reason : "슬립번호 없음");
      autoSkippedCount++;
      continue;
    }

    await query(
      `UPDATE market_sales_data SET ecount_status = '전송완료', ecount_slip_no = $3 WHERE channel = $1 AND external_id = $2`,
      [channel, targetExternalId, result.slipNos.join(",")]
    );
    autoSentCount++;
  }

  return { ok: true, date, insertedOrUpdated, autoSentCount, autoSkippedCount };
}
