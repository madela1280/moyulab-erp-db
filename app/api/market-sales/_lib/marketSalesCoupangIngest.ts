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
      refundProcessedCount: number;
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
  // ✅ 2026-11-11 추가: REFUND 중 items가 있는 건(실제 상품 반품)만 별도로 집계한다.
  //    items가 비어있는 REFUND는 실제로는 배송비만 환불된 건(원본 row에 deliveryFee만 있고 상품정보
  //    없음, 진단으로 실데이터 확인됨) — 매출표가 배송비를 애초에 안 다루므로 그냥 무시한다.
  const refundAggByKey = new Map<string, Aggregated>();

  for (const entry of fetchResult.entries) {
    if (entry.saleType !== "SALE") {
      refundCount++;
      if (!entry.items.length) continue; // 배송비만 환불된 건 — 상품 정보 없음, 반영할 게 없음.

      const saleDateRaw = String(entry.saleDate || "").slice(0, 10);
      const saleDate = /^\d{4}-\d{2}-\d{2}$/.test(saleDateRaw) ? saleDateRaw : date;

      for (const item of entry.items) {
        const key = `${saleDate}|${item.vendorItemId}`;
        const prev = refundAggByKey.get(key);
        if (prev) {
          prev.qtySum += item.quantity;
          prev.saleAmountSum += item.saleAmount;
        } else {
          refundAggByKey.set(key, {
            saleDate,
            vendorItemId: item.vendorItemId,
            vendorItemName: item.vendorItemName,
            qtySum: item.quantity,
            saleAmountSum: item.saleAmount,
          });
        }
      }
      continue;
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
  let refundProcessedCount = 0;

  // ✅ 2026-11-11: 건마다 전표를 따로 끊지 않고, 같은 날짜(saleDate) 안의 매출/반품을 각각 모아뒀다가
  //    날짜별로 한 전표(여러 줄)로 묶어서 전송한다(매출/반품은 섞지 않고 따로 묶음).
  type PendingLine = { targetExternalId: string; itemCode: string; qty: number; unitPrice: number };
  const pendingSaleByDate = new Map<string, PendingLine[]>();
  const pendingRefundByDate = new Map<string, PendingLine[]>();

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
    ecountStatus: string,
    salesType: "매출" | "반품"
  ) {
    return query(
      `
      INSERT INTO market_sales_data
        (channel, external_id, sale_date, market_item_name, item_code, item_name, qty, unit_price, supply_amt, vat_amt, total_amt, ecount_status, sales_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (channel, external_id) WHERE external_id IS NOT NULL DO UPDATE SET
        market_item_name = EXCLUDED.market_item_name,
        qty = market_sales_data.qty + EXCLUDED.qty,
        supply_amt = market_sales_data.supply_amt + EXCLUDED.supply_amt,
        vat_amt = market_sales_data.vat_amt + EXCLUDED.vat_amt,
        total_amt = market_sales_data.total_amt + EXCLUDED.total_amt,
        unit_price = CASE WHEN (market_sales_data.qty + EXCLUDED.qty) != 0
                      THEN ROUND((market_sales_data.supply_amt + EXCLUDED.supply_amt) / (market_sales_data.qty + EXCLUDED.qty))
                      ELSE 0 END
      WHERE market_sales_data.ecount_status != '전송완료'
      RETURNING id
      `,
      [channel, externalId, saleDate, agg.vendorItemName, "", "", finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus, salesType]
    );
  }

  // ✅ 매출(SALE)/반품(REFUND) 공용 처리 — externalIdBase/finalQty/supplyAmt/salesType만 다르게 넣어서 재사용.
  //    반품은 finalQty/supplyAmt를 호출부에서 이미 마이너스로 넘긴다(단가는 둘 다 나누면 자동으로 양수가 됨).
  async function processAggregate(
    agg: Aggregated,
    externalIdBase: string,
    finalQty: number,
    supplyAmt: number,
    salesType: "매출" | "반품"
  ) {
    const matched = matchMarketSalesItem(channel, agg.vendorItemId);

    const unitPrice = finalQty !== 0 ? Math.round(supplyAmt / finalQty) : 0;
    const vatAmt = Math.round(supplyAmt * 0.1);
    const totalAmt = supplyAmt + vatAmt;

    const itemCode = matched?.PROD_CD || "";
    const itemName = matched?.NAME || "";
    const ecountStatus = matched ? "미전송" : "미매핑";

    const upsertResult = await upsertIncrement(
      externalIdBase, agg.saleDate, agg, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus, salesType
    );

    let targetExternalId = externalIdBase;
    if (upsertResult.rowCount === 0) {
      // ✅ 기존 건이 이미 전송완료라 위 업데이트가 막혔다 — 이번에 새로 들어온 분만 별도 건으로 추가.
      const deltaExternalId = `${externalIdBase}+${date}`; // date(조회일=recognitionDate)는 하루에 한 번만 처리되므로 유일함 보장.
      await upsertIncrement(
        deltaExternalId, agg.saleDate, agg, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus, salesType
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
    if (salesType === "반품") refundProcessedCount++;

    if (!matched || !cust) {
      autoSkippedCount++;
      return;
    }

    // ✅ 즉시 전송하지 않고 큐에 쌓아둔다 — 이번 날짜 처리가 끝난 뒤 한 번에(날짜별로 묶어서) 보낸다.
    //    증분 합산 후의 실제 누적 수량/단가를 다시 읽어서 그 값을 큐에 넣는다.
    const existing = await query(
      `SELECT qty, unit_price, ecount_status FROM market_sales_data WHERE channel = $1 AND external_id = $2`,
      [channel, targetExternalId]
    );
    const row = existing.rows?.[0];
    if (!row || row.ecount_status === "전송완료") return;
    if (Number(row.qty) === 0) return; // 수량 0 건은 보낼 게 없음.

    const byDate = salesType === "반품" ? pendingRefundByDate : pendingSaleByDate;
    const list = byDate.get(agg.saleDate) || [];
    list.push({ targetExternalId, itemCode, qty: Number(row.qty), unitPrice: Number(row.unit_price) });
    byDate.set(agg.saleDate, list);
  }

  // ✅ 날짜별로 큐에 쌓인 라인들을 한 번에(전표 1개, 여러 줄) 전송한다. 전표 하나가 실패하면 그 안의
  //    건들은 전부 '미전송'으로 남고(다음날 retry-pending이 재시도), 다른 날짜/묶음은 계속 진행한다.
  async function flushPendingByDate(byDate: Map<string, PendingLine[]>, label: string) {
    let isFirstSend = true;
    for (const [saleDate, lines] of byDate.entries()) {
      if (!isFirstSend) await sleep(3000);
      isFirstSend = false;

      const result = await registerEcountSale({
        cust,
        whCd,
        lines: lines.map((l) => ({ PROD_CD: l.itemCode, QTY: l.qty, PRICE: l.unitPrice })),
        ioDate: toEcountIoDate(saleDate),
        groupAsOneSlip: true,
      });
      if (!result.ok || !result.slipNos.length) {
        console.error(`market-sales 자동수집(${label}) 이카운트 전송 실패(channel=${channel}, saleDate=${saleDate}):`, !result.ok ? result.reason : "슬립번호 없음");
        autoSkippedCount += lines.length;
        continue;
      }

      const slipNo = result.slipNos.join(",");
      for (const l of lines) {
        await query(
          `UPDATE market_sales_data SET ecount_status = '전송완료', ecount_slip_no = $3 WHERE channel = $1 AND external_id = $2`,
          [channel, l.targetExternalId, slipNo]
        );
        autoSentCount++;
      }
    }
  }

  for (const agg of aggByKey.values()) {
    const matched = matchMarketSalesItem(channel, agg.vendorItemId);
    const baseQty = matched?.baseQty || 1;
    const finalQty = agg.qtySum * baseQty;
    const supplyAmt = agg.saleAmountSum; // 쿠팡 saleAmount 합계를 공급가액으로 그대로 사용(반올림 오차 없음)
    const externalId = `${agg.saleDate}:${agg.vendorItemId}`;
    await processAggregate(agg, externalId, finalQty, supplyAmt, "매출");
  }

  // ✅ 반품 — external_id에 "R:" 접두사를 붙여 매출 건(같은 날짜+vendorItemId)과 절대 안 겹치게 하고,
  //    수량/금액은 마이너스로 뒤집어서 저장한다(단가는 마이너스/마이너스라 자동으로 양수가 됨).
  for (const agg of refundAggByKey.values()) {
    const matched = matchMarketSalesItem(channel, agg.vendorItemId);
    const baseQty = matched?.baseQty || 1;
    const finalQty = -(agg.qtySum * baseQty);
    const supplyAmt = -agg.saleAmountSum;
    const externalId = `R:${agg.saleDate}:${agg.vendorItemId}`;
    await processAggregate(agg, externalId, finalQty, supplyAmt, "반품");
  }

  await flushPendingByDate(pendingSaleByDate, "매출");
  await flushPendingByDate(pendingRefundByDate, "반품");

  return { ok: true, date, insertedOrUpdated, autoSentCount, autoSkippedCount, refundCount, refundProcessedCount };
}
