// app/api/market-sales/_lib/marketSalesSmartstorePumpIngest.ts
//
// 스마트스토어 유축기(대여) 전용 ingest. 일반상품(marketSalesSmartstoreIngest.ts)과 별도 파일로
// 분리한다 — 한 주문이 여러 productOrderId 줄로 쪼개져서 와서(기본상품+대여기간선택+[재구매/연장]),
// 합산 후 "상품번호+기기+대여기간+연장여부" 조합으로 품목코드를 결정해야 하기 때문에 매칭 방식이
// 근본적으로 다르다. 자세한 판별 규칙은 2026-11-12 사용자와 실제 엑셀 샘플로 하나씩 확인한 내용:
//
// - 그룹 묶기: 같은 orderId + 같은 productId인 줄들을 한 주문(유축기 1건)으로 묶는다.
// - 기본줄 판별: productName에 "당일출고"가 들어간 줄이 그 그룹의 기본줄이다.
// - 기기(device, 스윙 계열 productId=4941912837만 해당): 기본줄 productOption의
//   "선택2: XXX (...)" 에서 XXX(스윙FLEX | 스윙맥시)를 뽑는다. 심포니/락티나는 기기 구분 없음(null).
// - 연장여부(isExtension): 기본줄 productOption에 "연장 신청"이 포함되거나, 다른 줄 중 productOption에
//   "재구매"가 포함되어 있고 그 줄의 productName이 "선택안함"으로 시작하지 않으면(=실제로 연장기간을
//   선택한 것) true. "재구매 - 연장기간 선택: 선택안함(2주)"처럼 선택 안 하고 넘어간 경우는 연장 아님.
// - 대여기간(durationKey): 기본줄을 제외한 "대여기간 선택" 줄 중 금액(totalProductAmount)이 0이
//   아닌 줄이 정확히 1개면 그 줄의 productName에서 기간을 뽑는다(심포니/락티나는 "N주", 스윙 계열은
//   "N개월"). 0개면 기본값(심포니/락티나=2주, 스윙 계열=1개월). 2개 이상이면 판별 불가 → 미매핑.
// - 유축기 매출 금액은 기본줄 + 대여기간선택 줄(들)만 합산한다. 나머지(퍼스널핏 세트/부품/사은품/
//   추천상품 등, productOption이 "필수 - 대여기간 선택"/"재구매 - 연장기간 선택"이 아닌 줄)는 진짜
//   별개의 "상품"이라서 유축기 매출에 섞지 않는다 — 2026-11-12 사용자 확인("유축기는 유축기/상품은
//   상품으로 구분해야지"). 이 줄들은 일반상품 매칭(marketSalesProductMatcher.ts, productId|옵션
//   조합키)으로 각자 따로 매칭해서 별도 라인으로 저장/전송한다. 같은 productId라도 일반상품 매칭표에
//   코드가 없으면 기존 일반상품과 동일하게 "미매핑"으로 쌓여서 나중에 매핑표에 추가하면 된다.
// - 일반 스마트스토어 ingest(marketSalesSmartstoreIngest.ts)는 유축기 productId를 건너뛰도록
//   수정해뒀다 — 안 그러면 같은 원본 줄이 여기(유축기 ingest)와 거기(일반상품 ingest) 양쪽에서
//   중복으로 집계된다.

import { query } from "@/lib/db";
import { getNaverCredentials, fetchNaverProductOrders, type NaverProductOrderEntry } from "@/api/market-sales/_lib/naverApiClient";
import { PUMP_PRODUCT_IDS, matchPumpItem } from "@/api/market-sales/_lib/marketSalesPumpMapping";
import { matchMarketSalesItem } from "@/api/market-sales/_lib/marketSalesProductMatcher";
import { registerEcountSale } from "@/api/lotte-shipment/_lib/ecountSaveSale";
import { CHANNEL_CUST, CHANNEL_WH_CD, type MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";
import { toEcountIoDate, toKstIsoDayRange, epochMsToKstDateString } from "@/api/market-sales/_lib/marketSalesDate";
import { ensureMarketSalesTables } from "@/api/market-sales/_lib/marketSalesService";

export type PumpIngestResult =
  | { ok: true; date: string; insertedOrUpdated: number; autoSentCount: number; autoSkippedCount: number }
  | { ok: false; reason: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBaseRow(e: NaverProductOrderEntry): boolean {
  return e.productName.includes("당일출고");
}

function extractDevice(baseRow: NaverProductOrderEntry): string | null {
  const m = baseRow.productOption.match(/선택2:\s*([^\s(]+)/);
  return m ? m[1].trim() : null;
}

function isRealSelection(productName: string): boolean {
  return !productName.trim().startsWith("선택안함");
}

// ✅ 2026-11-12 추가: 같은 주문에 퍼스널핏 세트/부품/사은품/추천상품 같은 "진짜 다른 상품"이 섞여
//    들어오는 걸 실데이터로 확인함(예: "필수 - 퍼스널핏 세트: ...", "추천 상품 6종 (할인): ...").
//    대여기간 판별에는 "필수 - 대여기간 선택"/"재구매 - 연장기간 선택" 옵션 줄만 써야 한다 — 그 외
//    (퍼스널핏/부품 세트, 추천/보조 상품, 체험단리뷰 이벤트, 단품 등)는 금액은 합산하되 기간판별
//    후보에서는 제외한다.
function isDurationOptionRow(productOption: string): boolean {
  const t = productOption.trim();
  return /^필수\s*-\s*대여기간\s*선택/.test(t) || /^재구매\s*-\s*연장기간\s*선택/.test(t);
}

function extractDurationFromText(productName: string, isSwing: boolean): string | null {
  const m = isSwing ? productName.match(/(\d+)개월/) : productName.match(/(\d+)주/);
  if (!m) return null;
  return isSwing ? `${m[1]}개월` : `${m[1]}주`;
}

type GroupResolveResult =
  | { ok: true; device: string | null; durationKey: string; isExtension: boolean; durationRows: NaverProductOrderEntry[] }
  | { ok: false; reason: string; durationRows: NaverProductOrderEntry[] };

function resolveGroup(productId: string, baseRow: NaverProductOrderEntry, otherRows: NaverProductOrderEntry[]): GroupResolveResult {
  const isSwing = productId === "4941912837";
  const device = isSwing ? extractDevice(baseRow) : null;

  const durationRows = otherRows.filter((r) => isDurationOptionRow(r.productOption));

  const extensionByBase = baseRow.productOption.includes("연장 신청");
  const extensionByOther = durationRows.some((r) => r.productOption.includes("재구매") && isRealSelection(r.productName));
  const isExtension = extensionByBase || extensionByOther;

  const nonZeroRows = durationRows.filter((r) => Number(r.totalProductAmount) !== 0);
  let durationKey: string;
  if (nonZeroRows.length === 0) {
    durationKey = isSwing ? "1개월" : "2주";
  } else if (nonZeroRows.length === 1) {
    const parsed = extractDurationFromText(nonZeroRows[0].productName, isSwing);
    if (!parsed) return { ok: false, reason: "DURATION_PARSE_FAILED", durationRows };
    durationKey = parsed;
  } else {
    return { ok: false, reason: "AMBIGUOUS_DURATION", durationRows };
  }

  return { ok: true, device, durationKey, isExtension, durationRows };
}

export async function ingestSmartstorePumpSalesForDate(channel: MarketSalesChannel, date: string): Promise<PumpIngestResult> {
  await ensureMarketSalesTables();

  const creds = getNaverCredentials(channel);
  if (!creds) return { ok: false, reason: "CREDENTIALS_NOT_CONFIGURED" };

  const { fromISO, toISO } = toKstIsoDayRange(date);
  const fetchResult = await fetchNaverProductOrders(creds, fromISO, toISO);
  if (!fetchResult.ok) return { ok: false, reason: fetchResult.reason };

  const pumpEntries = fetchResult.data.filter((e) => PUMP_PRODUCT_IDS.has(e.productId));

  // ✅ 그룹키: orderId가 있으면 "orderId|productId", 없으면(아직 실데이터 미확인) 줄 하나짜리
  //    그룹으로 격리해서 다른 사람 주문과 섞이지 않게 한다(대신 기간판별은 기본값으로만 됨 — 로그로 남김).
  const groups = new Map<string, NaverProductOrderEntry[]>();
  for (const e of pumpEntries) {
    const key = e.orderId ? `${e.orderId}|${e.productId}` : `SOLO:${e.productOrderId}`;
    if (!e.orderId) {
      console.warn(`market-sales(유축기) orderId 없음 — productOrderId=${e.productOrderId} 단독 그룹으로 처리(실데이터 확인 필요)`);
    }
    const list = groups.get(key) || [];
    list.push(e);
    groups.set(key, list);
  }

  const cust = CHANNEL_CUST[channel];
  const whCd = CHANNEL_WH_CD[channel];

  let insertedOrUpdated = 0;
  let autoSentCount = 0;
  let autoSkippedCount = 0;

  type PendingLine = { externalId: string; itemCode: string; qty: number; unitPrice: number };
  const pendingSaleByDate = new Map<string, PendingLine[]>();

  // ✅ 한 곳에만 쓰는 upsert 패턴이라 공용 헬퍼로 뽑음(유축기 라인/상품 라인 둘 다 사용).
  async function upsertLine(
    externalId: string,
    saleDate: string,
    displayName: string,
    itemCode: string,
    itemName: string,
    qty: number,
    unitPrice: number,
    supplyAmt: number,
    ecountStatus: string
  ) {
    const vatAmt = Math.round(supplyAmt * 0.1);
    const totalAmt = supplyAmt + vatAmt;
    await query(
      `
      INSERT INTO market_sales_data
        (channel, external_id, sale_date, market_item_name, item_code, item_name, qty, unit_price, supply_amt, vat_amt, total_amt, ecount_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (channel, external_id) WHERE external_id IS NOT NULL DO UPDATE SET
        market_item_name = EXCLUDED.market_item_name,
        item_code = EXCLUDED.item_code,
        item_name = EXCLUDED.item_name,
        qty = EXCLUDED.qty,
        unit_price = EXCLUDED.unit_price,
        supply_amt = EXCLUDED.supply_amt,
        vat_amt = EXCLUDED.vat_amt,
        total_amt = EXCLUDED.total_amt,
        ecount_status = EXCLUDED.ecount_status
      WHERE market_sales_data.ecount_status != '전송완료'
      `,
      [channel, externalId, saleDate, displayName, itemCode, itemName, qty, unitPrice, supplyAmt, vatAmt, totalAmt, ecountStatus]
    );
    insertedOrUpdated++;
  }

  async function queueIfSendable(externalId: string, itemCode: string, qty: number, unitPrice: number, saleDate: string, matched: boolean) {
    if (!matched || !cust) {
      autoSkippedCount++;
      return;
    }
    const existing = await query(`SELECT ecount_status FROM market_sales_data WHERE channel = $1 AND external_id = $2`, [channel, externalId]);
    if (existing.rows?.[0]?.ecount_status === "전송완료") return;
    if (qty === 0) return;

    const list = pendingSaleByDate.get(saleDate) || [];
    list.push({ externalId, itemCode, qty, unitPrice });
    pendingSaleByDate.set(saleDate, list);
  }

  // ✅ 같은 부품/사은품(예: "100원 체험단리뷰 이벤트: 모유랩 다이렉트저장팩 세트")이 그날 여러 주문에
  //    반복해서 나올 수 있다(실데이터로 확인됨) — external_id가 같은 키로 겹치므로, 그룹 루프 중엔
  //    바로 저장하지 않고 먼저 합산한 다음 한 번에 저장한다(일반상품 ingest와 동일하게 "합산" 방식).
  type AddonAgg = { saleDate: string; matchKey: string; productId: string; option: string; productName: string; qty: number; amount: number };
  const addonAgg = new Map<string, AddonAgg>();

  for (const [groupKey, entries] of groups.entries()) {
    const baseRow = entries.find(isBaseRow) || entries[0];
    const otherRows = entries.filter((e) => e !== baseRow);

    const saleDate = baseRow.paymentDate ? epochMsToKstDateString(Date.parse(baseRow.paymentDate)) : date;
    const qty = Number(baseRow.quantity) || 1;

    const resolved = resolveGroup(baseRow.productId, baseRow, otherRows);
    const matched = resolved.ok ? matchPumpItem(baseRow.productId, resolved.device, resolved.durationKey, resolved.isExtension) : null;
    if (!resolved.ok) {
      console.error(`market-sales(유축기) 그룹 판별 실패(groupKey=${groupKey}): ${resolved.reason}`);
    }

    // ✅ 유축기 매출 금액 = 기본줄 + 대여기간선택 줄(들)만. 퍼스널핏 세트/부품/사은품 등은 제외.
    const pumpAmount = baseRow.totalProductAmount + resolved.durationRows.reduce((sum, r) => sum + Number(r.totalProductAmount || 0), 0);
    const unitPrice = qty !== 0 ? Math.round(pumpAmount / qty) : 0;
    const itemCode = matched?.PROD_CD || "";
    const itemName = matched?.NAME || "";
    const ecountStatus = matched ? "미전송" : "미매핑";
    const externalId = `PUMP:${groupKey}`;

    await upsertLine(externalId, saleDate, baseRow.productName, itemCode, itemName, qty, unitPrice, pumpAmount, ecountStatus);
    await queueIfSendable(externalId, itemCode, qty, unitPrice, saleDate, !!matched);

    // ✅ 대여기간 선택 줄이 아닌 나머지(퍼스널핏 세트/부품/사은품/추천상품 등)는 진짜 별개 상품이라
    //    일반상품 매칭표(productId|옵션 조합키)로 합산해서 매칭한다.
    const durationRowSet = new Set(resolved.durationRows);
    const addonRows = otherRows.filter((r) => !durationRowSet.has(r));
    for (const addon of addonRows) {
      const option = (addon.productOption || "").trim();
      const matchKey = option ? `${addon.productId}|${option}` : addon.productId;
      const aggKey = `${saleDate}|${matchKey}`;
      const prev = addonAgg.get(aggKey);
      if (prev) {
        prev.qty += Number(addon.quantity) || 1;
        prev.amount += Number(addon.totalProductAmount || 0);
      } else {
        addonAgg.set(aggKey, {
          saleDate,
          matchKey,
          productId: addon.productId,
          option,
          productName: addon.productName,
          qty: Number(addon.quantity) || 1,
          amount: Number(addon.totalProductAmount || 0),
        });
      }
    }
  }

  for (const agg of addonAgg.values()) {
    const addonMatched = matchMarketSalesItem(channel, agg.matchKey);
    const addonBaseQty = addonMatched?.baseQty || 1;
    const addonQty = agg.qty * addonBaseQty;
    const addonUnitPrice = addonQty !== 0 ? Math.round(agg.amount / addonQty) : 0;
    const addonDisplayName = agg.option ? `${agg.productName}/${agg.option}` : agg.productName;
    const addonExternalId = `${agg.saleDate}:${agg.matchKey}`;
    const addonEcountStatus = addonMatched ? "미전송" : "미매핑";

    await upsertLine(
      addonExternalId,
      agg.saleDate,
      addonDisplayName,
      addonMatched?.PROD_CD || "",
      addonMatched?.NAME || "",
      addonQty,
      addonUnitPrice,
      agg.amount,
      addonEcountStatus
    );
    await queueIfSendable(addonExternalId, addonMatched?.PROD_CD || "", addonQty, addonUnitPrice, agg.saleDate, !!addonMatched);
  }

  let isFirstSend = true;
  for (const [saleDate, lines] of pendingSaleByDate.entries()) {
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
      console.error(`market-sales(유축기) 이카운트 전송 실패(channel=${channel}, saleDate=${saleDate}):`, !result.ok ? result.reason : "슬립번호 없음");
      autoSkippedCount += lines.length;
      continue;
    }

    const slipNo = result.slipNos.join(",");
    for (const l of lines) {
      await query(`UPDATE market_sales_data SET ecount_status = '전송완료', ecount_slip_no = $3 WHERE channel = $1 AND external_id = $2`, [
        channel,
        l.externalId,
        slipNo,
      ]);
      autoSentCount++;
    }
  }

  return { ok: true, date, insertedOrUpdated, autoSentCount, autoSkippedCount };
}
