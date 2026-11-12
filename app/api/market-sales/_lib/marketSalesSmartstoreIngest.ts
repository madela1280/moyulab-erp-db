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
//
// ✅ 2026-11-12 반품/취소 처리 추가 — diag-naver-claims로 실데이터 확인한 내용:
//    productOrderStatus="RETURNED"(반품/환불) 또는 "CANCELED"(결제 후 취소) 둘 다 totalProductAmount/
//    quantity는 원래값 그대로지만 remainQuantity/remainProductAmount가 그만큼 줄어든다(전체면 0).
//    "원래값-remain값"이 실제 반품/취소 처리된 수량/금액이다. 쿠팡 반품과 동일하게 매출에서 빼지 않고
//    완전히 독립된 '반품' 행으로 별도 적재(수량/금액 음수, sales_type='반품'), 매출/반품 각각
//    날짜별로 한 전표씩 묶어서 전송한다. (CANCELED_BY_NOPAYMENT=미결제취소만 애초에 제외됨)
//    ⚠️ 한계: 이 ingest는 결제일시(paymentDate) 기준으로만 조회하기 때문에, 결제일과 다른 날짜에
//    반품이 완료되는 경우(흔함)는 그 결제일 날짜를 다시 수집해야만 잡힌다 — 자동으로는 안 잡힌다.
//    네이버가 제공한다는 "최근 상태변경 건 조회" 전용 엔드포인트를 써야 완전히 해결되는데, 아직
//    미구현(후속 작업으로 남김).

import { query } from "@/lib/db";
import { getNaverCredentials, fetchNaverProductOrders } from "@/api/market-sales/_lib/naverApiClient";
import { matchMarketSalesItem } from "@/api/market-sales/_lib/marketSalesProductMatcher";
import { PUMP_PRODUCT_IDS } from "@/api/market-sales/_lib/marketSalesPumpMapping";
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
  const refundAggByKey = new Map<string, Aggregated>();

  for (const entry of fetchResult.data) {
    if (!entry.productId) continue;
    // ✅ 2026-11-12 추가: 유축기(대여) productId는 marketSalesSmartstorePumpIngest.ts가 전담 처리.
    //    여기서 같이 집계하면 같은 원본 줄이 양쪽에 중복으로 쌓인다.
    if (PUMP_PRODUCT_IDS.has(entry.productId)) continue;
    // ✅ 결제일시(paymentDate)를 실제 매출일로 사용 — 쿠팡처럼 조회일과 실제 판매일이 어긋나는
    //    문제가 없다(요청 자체가 결제일시 범위 기준이라 어긋날 수 없음). 방어적으로 KST 날짜만 추출.
    const saleDate = entry.paymentDate ? epochMsToKstDateString(Date.parse(entry.paymentDate)) : date;

    const option = (entry.productOption || "").trim();
    const matchKey = option ? `${entry.productId}|${option}` : entry.productId;
    const displayName = option ? `${entry.productName}/${option}` : entry.productName;
    const key = `${saleDate}|${matchKey}`;

    // ✅ 반품/취소여도 원래 매출 자체는 그대로 독립 행으로 남긴다(아래에서 계속 진행해서 매출 집계도
    //    같이 함) — 반품행을 따로 추가로 쌓는 것뿐, 매출에서 빼거나 건너뛰지 않는다. CANCELED(결제 후
    //    취소)도 RETURNED와 동일하게 처리한다(2026-11-12: CANCELED_BY_NOPAYMENT만 애초에 제외됨).
    if (entry.productOrderStatus === "RETURNED" || entry.productOrderStatus === "CANCELED") {
      const returnedQty = Math.max(0, entry.quantity - entry.remainQuantity);
      const returnedAmount = Math.max(0, entry.totalProductAmount - entry.remainProductAmount);
      if (returnedQty > 0 || returnedAmount > 0) {
        const prevR = refundAggByKey.get(key);
        if (prevR) {
          prevR.qtySum += returnedQty;
          prevR.amountSum += returnedAmount;
        } else {
          refundAggByKey.set(key, { saleDate, matchKey, displayName, qtySum: returnedQty, amountSum: returnedAmount });
        }
      }
    }

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

  // ✅ 2026-11-11: 건마다 전표를 따로 끊지 않고, 같은 날짜(saleDate) 안의 매출을 모아뒀다가
  //    날짜별로 한 전표(여러 줄)로 묶어서 전송한다(쿠팡 ingest와 동일한 구조).
  type PendingLine = { targetExternalId: string; itemCode: string; qty: number; unitPrice: number };
  const pendingSaleByDate = new Map<string, PendingLine[]>();
  const pendingRefundByDate = new Map<string, PendingLine[]>();

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

    // ✅ 즉시 전송하지 않고 큐에 쌓아둔다 — 날짜별로 묶어서 한 번에 전송(아래 flush에서).
    const existing = await query(
      `SELECT qty, unit_price, ecount_status FROM market_sales_data WHERE channel = $1 AND external_id = $2`,
      [channel, targetExternalId]
    );
    const row = existing.rows?.[0];
    if (!row || row.ecount_status === "전송완료") continue;
    if (Number(row.qty) === 0) continue;

    const list = pendingSaleByDate.get(agg.saleDate) || [];
    list.push({ targetExternalId, itemCode, qty: Number(row.qty), unitPrice: Number(row.unit_price) });
    pendingSaleByDate.set(agg.saleDate, list);
  }

  // ✅ 반품은 매출과 완전히 독립된 행으로 저장(수량/금액 음수, sales_type='반품') — 쿠팡 반품과 동일한
  //    설계. external_id는 "RETURN:" 접두어로 매출 행과 절대 충돌하지 않게 한다.
  for (const agg of refundAggByKey.values()) {
    const matched = matchMarketSalesItem(channel, agg.matchKey);
    const baseQty = matched?.baseQty || 1;

    const finalQty = -(agg.qtySum * baseQty);
    const supplyAmt = -agg.amountSum;
    const unitPrice = finalQty !== 0 ? Math.round(supplyAmt / finalQty) : 0;
    const vatAmt = Math.round(supplyAmt * 0.1);
    const totalAmt = supplyAmt + vatAmt;

    const itemCode = matched?.PROD_CD || "";
    const itemName = matched?.NAME || "";
    const ecountStatus = matched ? "미전송" : "미매핑";
    const externalId = `RETURN:${agg.saleDate}:${agg.matchKey}`;

    const upsertResult = await upsertIncrement(externalId, agg.saleDate, agg, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus);

    let targetExternalId = externalId;
    if (upsertResult.rowCount === 0) {
      const deltaExternalId = `${externalId}+${date}`;
      await upsertIncrement(deltaExternalId, agg.saleDate, agg, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus);
      targetExternalId = deltaExternalId;
    }

    await query(
      `UPDATE market_sales_data SET item_code = $3, item_name = $4, ecount_status = $5, sales_type = '반품'
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
    if (Number(row.qty) === 0) continue;

    const list = pendingRefundByDate.get(agg.saleDate) || [];
    list.push({ targetExternalId, itemCode, qty: Number(row.qty), unitPrice: Number(row.unit_price) });
    pendingRefundByDate.set(agg.saleDate, list);
  }

  // ✅ 날짜별로 큐에 쌓인 라인들을 한 번에(전표 1개, 여러 줄) 전송한다. 매출/반품은 각각 별도 전표.
  let isFirstSend = true;
  async function flushByDate(byDate: Map<string, PendingLine[]>, label: string) {
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
        console.error(
          `market-sales(스마트스토어${label}) 자동수집 이카운트 전송 실패(channel=${channel}, saleDate=${saleDate}):`,
          !result.ok ? result.reason : "슬립번호 없음"
        );
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

  await flushByDate(pendingSaleByDate, "");
  await flushByDate(pendingRefundByDate, " 반품");

  return { ok: true, date, insertedOrUpdated, autoSentCount, autoSkippedCount };
}
