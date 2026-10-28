// app/api/market-sales/_lib/marketSalesService.ts
//
// 쿠팡/스마트스토어 매출 데이터 조회/삭제/이카운트전송 공용 서비스.
// ⚠️ 지금 단계는 "화면/저장/전송" 틀만 만든 것 — 쿠팡/네이버 API로 실제 매출을 가져와서
//    이 테이블에 채워 넣는 자동 수집 로직은 아직 없음(상품명 매핑표 받은 뒤 다음 단계로 진행 예정).

import { query } from "@/lib/db";
import { registerEcountSale } from "@/api/lotte-shipment/_lib/ecountSaveSale";
import { matchMarketSalesItem } from "@/api/market-sales/_lib/marketSalesProductMatcher";
import {
  CHANNEL_CUST,
  CHANNEL_WH_CD,
  isMarketSalesChannel,
  type MarketSalesChannel,
} from "@/api/market-sales/_lib/marketSalesChannels";

export const SEND_BATCH_MAX = 300;

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

export type MarketSalesRow = {
  id: number;
  channel: MarketSalesChannel;
  일자: string | null;
  품목: string; // 이카운트 PROD_CD (매칭 전에는 빈 값)
  품목명: string; // 원본 상품명
  수량: number;
  단가: number;
  공급가액: number;
  부가세: number;
  합계: number;
  이카운트전송상태: "전송완료" | "미전송" | "미매핑";
};

let ensured = false;
async function ensureTables() {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS market_sales_data (
      id BIGSERIAL PRIMARY KEY,
      channel TEXT NOT NULL,
      external_id TEXT,
      sale_date DATE,
      item_code TEXT NOT NULL DEFAULT '',
      item_name TEXT NOT NULL DEFAULT '',
      qty NUMERIC NOT NULL DEFAULT 0,
      unit_price NUMERIC NOT NULL DEFAULT 0,
      supply_amt NUMERIC NOT NULL DEFAULT 0,
      vat_amt NUMERIC NOT NULL DEFAULT 0,
      total_amt NUMERIC NOT NULL DEFAULT 0,
      ecount_status TEXT NOT NULL DEFAULT '미전송',
      ecount_slip_no TEXT,
      raw_data JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS market_sales_data_channel_external_id_key
      ON market_sales_data (channel, external_id)
      WHERE external_id IS NOT NULL;
  `);
  ensured = true;
}

function toRow(r: any): MarketSalesRow {
  return {
    id: Number(r.id),
    channel: r.channel,
    일자: r.sale_date ? String(r.sale_date) : null,
    품목: normalizeString(r.item_code),
    품목명: normalizeString(r.item_name),
    수량: Number(r.qty) || 0,
    단가: Number(r.unit_price) || 0,
    공급가액: Number(r.supply_amt) || 0,
    부가세: Number(r.vat_amt) || 0,
    합계: Number(r.total_amt) || 0,
    이카운트전송상태: r.ecount_status,
  };
}

export async function listMarketSales(channel: MarketSalesChannel): Promise<MarketSalesRow[]> {
  await ensureTables();
  const r = await query(
    `
    SELECT id, channel, sale_date::text AS sale_date, item_code, item_name, qty, unit_price,
           supply_amt, vat_amt, total_amt, ecount_status
    FROM market_sales_data
    WHERE channel = $1
    ORDER BY sale_date DESC NULLS LAST, id DESC
    `,
    [channel]
  );
  return (r.rows || []).map(toRow);
}

export async function deleteMarketSales(channel: MarketSalesChannel, ids: number[]): Promise<{ deletedCount: number }> {
  await ensureTables();
  const safeIds = ids.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  if (!safeIds.length) return { deletedCount: 0 };

  const r = await query(
    `DELETE FROM market_sales_data WHERE channel = $1 AND id = ANY($2::bigint[])`,
    [channel, safeIds]
  );
  return { deletedCount: r.rowCount || 0 };
}

export type EcountSendResult = {
  sentCount: number;
  skippedCount: number;
};

export async function sendMarketSalesToEcount(
  channel: MarketSalesChannel,
  ids: number[]
): Promise<EcountSendResult | { error: "CUST_NOT_CONFIGURED" }> {
  await ensureTables();

  const cust = CHANNEL_CUST[channel];
  if (!cust) return { error: "CUST_NOT_CONFIGURED" };
  const whCd = CHANNEL_WH_CD[channel];

  const safeIds = Array.from(new Set(ids.map((x) => Number(x)).filter((x) => Number.isFinite(x)))).slice(
    0,
    SEND_BATCH_MAX
  );
  if (!safeIds.length) return { sentCount: 0, skippedCount: 0 };

  const r = await query(
    `SELECT id, item_name, qty, unit_price, ecount_status
     FROM market_sales_data WHERE channel = $1 AND id = ANY($2::bigint[])`,
    [channel, safeIds]
  );

  let sentCount = 0;
  let skippedCount = 0;

  for (const row of r.rows || []) {
    if (row.ecount_status === "전송완료") continue;

    const matched = matchMarketSalesItem(channel, row.item_name);
    if (!matched) {
      await query(`UPDATE market_sales_data SET ecount_status = '미매핑', item_code = '' WHERE id = $1`, [row.id]);
      skippedCount++;
      continue;
    }

    const qty = Number(row.qty) || 0;
    const price = matched.PRICE;

    const result = await registerEcountSale({
      cust,
      whCd,
      lines: [{ PROD_CD: matched.PROD_CD, QTY: qty, PRICE: price }],
    });

    if (!result.ok || !result.slipNos.length) {
      console.error(`market-sales 이카운트 전송 실패(id=${row.id}, channel=${channel}):`, !result.ok ? result.reason : "슬립번호 없음");
      skippedCount++;
      continue;
    }

    await query(
      `UPDATE market_sales_data SET ecount_status = '전송완료', ecount_slip_no = $2, item_code = $3 WHERE id = $1`,
      [row.id, result.slipNos.join(","), matched.PROD_CD]
    );
    sentCount++;
  }

  return { sentCount, skippedCount };
}

export { isMarketSalesChannel };
