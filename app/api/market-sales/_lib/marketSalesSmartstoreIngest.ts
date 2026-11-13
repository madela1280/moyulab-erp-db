// app/api/market-sales/_lib/marketSalesSmartstoreIngest.ts
//
// 네이버 커머스API(naverApiClient.ts) 상품주문 조회 -> market_sales_data 저장 -> 이카운트
// 자동전송까지 한 번에 수행. 쿠팡 ingest(marketSalesCoupangIngest.ts)와 동일한 "증분 upsert +
// 전송완료 건은 델타로만 추가" 구조를 그대로 따른다(중복전송 방지 설계도 동일).
//
// ⚠️ 2026-11-13 확정: 매출액은 productOrder.totalPaymentAmount(실결제액, 배송비 제외) 기준이다.
//    totalProductAmount는 "할인 적용 전" 금액이라 할인된 주문에서 매출이 부풀려지는 심각한
//    과대집계 버그가 있었다(실데이터로 확인: 정가 28000원/할인 8000원인데 totalProductAmount=28000,
//    실제 결제액 totalPaymentAmount=20000). 반드시 totalPaymentAmount/remainPaymentAmount를 써야 한다.
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
    // ⚠️ 2026-11-12 수정: 반품/취소 행은 결제일이 아니라 "처리완료일"(claimCompletedDate) 기준으로
    //    집계한다(사용자 확인) — 접수일/결제일과 처리완료일이 며칠씩 차이나는 경우가 실데이터로
    //    확인됨(11/07 결제건이 11/08에 취소완료된 사례). 처리완료일이 없으면(이례적) 결제일로 대체.
    if (entry.productOrderStatus === "RETURNED" || entry.productOrderStatus === "CANCELED") {
      const returnedQty = Math.max(0, entry.quantity - entry.remainQuantity);
      const returnedAmount = Math.max(0, entry.totalPaymentAmount - entry.remainPaymentAmount);
      if (returnedQty > 0 || returnedAmount > 0) {
        const refundDate = entry.claimCompletedDate ? epochMsToKstDateString(Date.parse(entry.claimCompletedDate)) : saleDate;
        const refundKey = `${refundDate}|${matchKey}`;
        const prevR = refundAggByKey.get(refundKey);
        if (prevR) {
          prevR.qtySum += returnedQty;
          prevR.amountSum += returnedAmount;
        } else {
          refundAggByKey.set(refundKey, { saleDate: refundDate, matchKey, displayName, qtySum: returnedQty, amountSum: returnedAmount });
        }
      }
    }

    const prev = aggByKey.get(key);
    if (prev) {
      prev.qtySum += entry.quantity;
      prev.amountSum += entry.totalPaymentAmount;
    } else {
      aggByKey.set(key, {
        saleDate,
        matchKey,
        displayName,
        qtySum: entry.quantity,
        amountSum: entry.totalPaymentAmount,
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

  // ⚠️ 2026-11-13 수정(실데이터 중복전송 버그 수정): 이 함수는 호출될 때마다 그 날짜의 네이버
  //    주문을 처음부터 통째로 재집계한다(새로 들어온 분만 보는 게 아님) — 그래서 "증분 합산"이
  //    아니라 "그 키의 당일 전체 금액으로 덮어쓰기"가 맞다. 예전엔 합산(+=) 방식이라, 이미
  //    전송완료된 날짜를 다시 조회하면 "수량이 늘었다"고 착각하고 당일 전체 금액을 또 다른
  //    external_id(델타행)로 만들어서 또 전송해버리는 중복전송 버그가 있었다(실데이터로 확인,
  //    2026-11-13). 유축기 ingest(marketSalesSmartstorePumpIngest.ts)는 처음부터 이 방식(덮어쓰기)
  //    이라 버그가 없었음 — 그 패턴을 그대로 따른다. 이미 전송완료 상태면 WHERE 조건 때문에
  //    아예 손대지 않는다(재전송 없음, 안전).
  async function upsertReplace(
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
    // ✅ saleDate는 이 함수 호출의 date 파라미터와 항상 같다(결제일시 범위 조회라 어긋날 수 없음) —
    //    그래서 이 키는 재호출돼도 항상 같은 값이고, 덮어쓰기(REPLACE) 방식이 안전하다.
    const externalId = `${agg.saleDate}:${agg.matchKey}`;

    await upsertReplace(externalId, agg.saleDate, agg, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus);

    await query(
      `UPDATE market_sales_data SET item_code = $3, item_name = $4, ecount_status = $5
       WHERE channel = $1 AND external_id = $2 AND item_code = ''`,
      [channel, externalId, itemCode, itemName, ecountStatus]
    );
    insertedOrUpdated++;

    if (!matched || !cust) {
      autoSkippedCount++;
      continue;
    }

    // ✅ 즉시 전송하지 않고 큐에 쌓아둔다 — 날짜별로 묶어서 한 번에 전송(아래 flush에서).
    const existing = await query(
      `SELECT qty, unit_price, ecount_status FROM market_sales_data WHERE channel = $1 AND external_id = $2`,
      [channel, externalId]
    );
    const row = existing.rows?.[0];
    if (!row || row.ecount_status === "전송완료") continue;
    if (Number(row.qty) === 0) continue;

    const list = pendingSaleByDate.get(agg.saleDate) || [];
    list.push({ targetExternalId: externalId, itemCode, qty: Number(row.qty), unitPrice: Number(row.unit_price) });
    pendingSaleByDate.set(agg.saleDate, list);
  }

  // ✅ 반품은 매출과 완전히 독립된 행으로 저장(수량/금액 음수, sales_type='반품') — 쿠팡 반품과 동일한
  //    설계. external_id는 "RETURN:" 접두어로 매출 행과 절대 충돌하지 않게 한다.
  // ⚠️ 2026-11-13 수정: 반품 완료일(refundDate=claimCompletedDate)은 이 호출의 조회일(date, 결제일
  //    기준)과 다를 수 있고, 서로 다른 날짜를 조회하는 여러 호출이 같은 refundDate+matchKey 조합을
  //    동시에 만들어낼 수 있다(예: 7/5 결제건과 7/6 결제건이 둘 다 7/16에 반품 처리완료). 이 경우
  //    external_id에 조회일(date)을 포함하지 않으면, REPLACE 방식에서 나중 호출이 먼저 호출이
  //    저장한 반품행을 덮어써서 먼저 것이 통째로 사라지는(과소집계) 문제가 생긴다. 그래서 반품
  //    external_id에는 항상 "조회일(date)"을 포함시켜 호출마다 고유한 키를 보장한다 — 같은 조회일을
  //    반복 호출하면 그대로 멱등(안전), 다른 조회일이 같은 refundDate에 기여하면 별도 행으로 공존
  //    (전표가 여러 개로 나뉘는 건 이미 합의된 설계 — 금액은 중복/누락 없음).
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
    const externalId = `RETURN:${agg.saleDate}:${agg.matchKey}:FROM${date}`;

    await upsertReplace(externalId, agg.saleDate, agg, finalQty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus);

    await query(
      `UPDATE market_sales_data SET item_code = $3, item_name = $4, ecount_status = $5, sales_type = '반품'
       WHERE channel = $1 AND external_id = $2 AND item_code = ''`,
      [channel, externalId, itemCode, itemName, ecountStatus]
    );
    insertedOrUpdated++;

    if (!matched || !cust) {
      autoSkippedCount++;
      continue;
    }

    const existing = await query(
      `SELECT qty, unit_price, ecount_status FROM market_sales_data WHERE channel = $1 AND external_id = $2`,
      [channel, externalId]
    );
    const row = existing.rows?.[0];
    if (!row || row.ecount_status === "전송완료") continue;
    if (Number(row.qty) === 0) continue;

    const list = pendingRefundByDate.get(agg.saleDate) || [];
    list.push({ targetExternalId: externalId, itemCode, qty: Number(row.qty), unitPrice: Number(row.unit_price) });
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
