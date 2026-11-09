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
import { ensureMarketSalesTables } from "@/api/market-sales/_lib/marketSalesService";

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
  saleDate: string;
  vendorItemId: string;
  vendorItemName: string;
  qtySum: number;
  saleAmountSum: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ✅ 2026-11-09: 쿠팡 revenue-history는 recognitionDate(매출인식일) 범위로 조회하지만, 그 조회일이
//    실제 판매일이 아니다(인식이 며칠~몇 주 늦게 확정될 수 있음). 그래서 "일자"/이카운트 IO_DATE는
//    각 주문의 실제 saleDate를 써야 한다 — 조회는 지금처럼 하루(recognitionDate=date)씩 그대로 하되,
//    묶는 기준(품목 집계 키)만 saleDate+vendorItemId로 바꾼다.
export async function ingestCoupangSalesForDate(channel: MarketSalesChannel, date: string): Promise<IngestResult> {
  await ensureMarketSalesTables();

  const creds = getCoupangCredentials(channel);
  if (!creds) return { ok: false, reason: "CREDENTIALS_NOT_CONFIGURED" };

  const fetchResult = await fetchCoupangRevenueHistory(creds, date, date);
  if (!fetchResult.ok) return { ok: false, reason: fetchResult.reason };

  let refundCount = 0;
  const aggByKey = new Map<string, Aggregated>();

  for (const entry of fetchResult.entries) {
    if (entry.saleType !== "SALE") {
      refundCount++;
      continue; // ⚠️ 환불(REFUND) 건은 지금 단계에서 반영 안 함 — 별도 처리 필요(차감 로직 미구현).
    }
    // 방어적으로 날짜 형식만 자르고, saleDate가 비정상이면 조회일(recognitionDate)로 대체한다.
    const saleDateRaw = String(entry.saleDate || "").slice(0, 10);
    const saleDate = /^\d{4}-\d{2}-\d{2}$/.test(saleDateRaw) ? saleDateRaw : date;

    for (const item of entry.items) {
      const key = `${saleDate}|${item.vendorItemId}`;
      const prev = aggByKey.get(key);
      if (prev) {
        prev.qtySum += item.quantity;
        prev.saleAmountSum += item.saleAmount;
      } else {
        aggByKey.set(key, {
          saleDate,
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
  let isFirstSend = true;

  // ✅ (channel, external_id) 행에 이번 배치분을 "더한다"(증분). 이미 전송완료 상태면 WHERE에 걸려서
  //    아무것도 바뀌지 않는다 — 그 경우(rowCount=0)에만 호출부에서 별도 델타 건을 만든다.
  //    기존 전송완료 전표의 수량/금액은 절대 건드리지 않는다(중복전송 방지).
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
      [channel, externalId, saleDate, agg.vendorItemName, "", "", finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus]
    );
  }

  for (const agg of aggByKey.values()) {
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
    const externalId = `${agg.saleDate}:${agg.vendorItemId}`;

    const upsertResult = await upsertIncrement(
      externalId, agg.saleDate, agg, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus
    );

    let targetExternalId = externalId;
    if (upsertResult.rowCount === 0) {
      // ✅ 기존 건이 이미 전송완료라 위 업데이트가 막혔다 — 이번에 새로 들어온 분만 별도 건으로 추가.
      const deltaExternalId = `${externalId}+${date}`; // date(조회일=recognitionDate)는 하루에 한 번만 처리되므로 유일함 보장.
      await upsertIncrement(
        deltaExternalId, agg.saleDate, agg, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus
      );
      targetExternalId = deltaExternalId;
    }

    // 품목코드/품목명은 신규 insert일 때만 채운다(기존 행 수정 시 사용자가 수동으로 고친 매핑을 덮어쓰지 않음).
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

    // ✅ 수집 직후 바로 이카운트 자동전송 시도(이미 전송완료된 건은 건드리지 않음).
    //    증분 합산 후의 실제 누적 수량/단가를 다시 읽어서 그 값으로 보낸다.
    const existing = await query(
      `SELECT qty, unit_price, ecount_status FROM market_sales_data WHERE channel = $1 AND external_id = $2`,
      [channel, targetExternalId]
    );
    const row = existing.rows?.[0];
    if (!row || row.ecount_status === "전송완료") continue;

    // ✅ 이카운트에 연달아 너무 빠르게 요청하면 가끔 JSON 대신 에러 페이지를 돌려받는 문제가
    //    실사용 로그로 확인됨 — 품목 사이에 짧은 간격을 둬서 완화한다(첫 건은 대기 없이 바로 전송).
    if (!isFirstSend) await sleep(3000);
    isFirstSend = false;

    const result = await registerEcountSale({
      cust,
      whCd,
      lines: [{ PROD_CD: itemCode, QTY: Number(row.qty), PRICE: Number(row.unit_price) }],
      ioDate: toEcountIoDate(agg.saleDate),
    });
    if (!result.ok || !result.slipNos.length) {
      console.error(`market-sales 자동수집 이카운트 전송 실패(channel=${channel}, externalId=${targetExternalId}):`, !result.ok ? result.reason : "슬립번호 없음");
      autoSkippedCount++;
      continue;
    }

    await query(
      `UPDATE market_sales_data SET ecount_status = '전송완료', ecount_slip_no = $3 WHERE channel = $1 AND external_id = $2`,
      [channel, targetExternalId, result.slipNos.join(",")]
    );
    autoSentCount++;
  }

  return { ok: true, date, insertedOrUpdated, autoSentCount, autoSkippedCount, refundCount };
}
