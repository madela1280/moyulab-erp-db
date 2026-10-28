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
  마켓상품명: string; // 채널 원본 상품명(쿠팡/네이버에서 그대로 가져온 값, 매칭 입력값)
  품목: string; // 이카운트 PROD_CD (매칭 전에는 빈 값)
  품목명: string; // 매칭된 이카운트 공식 품목명(매칭 전에는 빈 값)
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
      market_item_name TEXT NOT NULL DEFAULT '',
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
  // ✅ 2026-10-28 추가: 채널 원본 상품명(마켓상품명)을 품목/품목명과 분리 보관.
  await query(`ALTER TABLE market_sales_data ADD COLUMN IF NOT EXISTS market_item_name TEXT NOT NULL DEFAULT '';`);
  ensured = true;
}

function toRow(r: any): MarketSalesRow {
  return {
    id: Number(r.id),
    channel: r.channel,
    일자: r.sale_date ? String(r.sale_date) : null,
    마켓상품명: normalizeString(r.market_item_name),
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
    SELECT id, channel, sale_date::text AS sale_date, market_item_name, item_code, item_name, qty, unit_price,
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

export type UpdateLineField = "품목" | "품목명" | "수량" | "단가";
const FIELD_TO_COLUMN: Record<UpdateLineField, string> = {
  품목: "item_code",
  품목명: "item_name",
  수량: "qty",
  단가: "unit_price",
};

export type UpdateLineResult = { ok: true } | { ok: false; reason: "NOT_FOUND" | "ALREADY_SENT" | "INVALID_FIELD" };

// ✅ 미매핑/미전송 건을 사용자가 직접 고쳐서 재전송할 수 있게. 전송완료된 건은 전표 내용과
//    안 맞게 되므로 수정 금지(롯데택배 상품명 수정과 동일 규칙).
export async function updateMarketSalesLine(
  channel: MarketSalesChannel,
  id: number,
  field: UpdateLineField,
  valueRaw: string
): Promise<UpdateLineResult> {
  await ensureTables();

  const column = FIELD_TO_COLUMN[field];
  if (!column) return { ok: false, reason: "INVALID_FIELD" };

  const r = await query(`SELECT ecount_status FROM market_sales_data WHERE channel = $1 AND id = $2`, [channel, id]);
  const row = r.rows?.[0];
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  if (row.ecount_status === "전송완료") return { ok: false, reason: "ALREADY_SENT" };

  const isNumericField = field === "수량" || field === "단가";
  const value = isNumericField ? Number(valueRaw) || 0 : normalizeString(valueRaw);

  // ✅ 품목(코드)을 직접 채워 넣으면 "미매핑" 꼬리표를 떼서 다시 전송 시도할 수 있게 한다.
  if (field === "품목" && value) {
    await query(
      `UPDATE market_sales_data SET item_code = $3, ecount_status = CASE WHEN ecount_status = '미매핑' THEN '미전송' ELSE ecount_status END WHERE channel = $1 AND id = $2`,
      [channel, id, value]
    );
  } else {
    await query(`UPDATE market_sales_data SET ${column} = $3 WHERE channel = $1 AND id = $2`, [channel, id, value]);
  }

  return { ok: true };
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
    `SELECT id, external_id, item_code, item_name, qty, unit_price, ecount_status
     FROM market_sales_data WHERE channel = $1 AND id = ANY($2::bigint[])`,
    [channel, safeIds]
  );

  let sentCount = 0;
  let skippedCount = 0;

  for (const row of r.rows || []) {
    if (row.ecount_status === "전송완료") continue;

    // ✅ 품목(item_code)이 이미 채워져 있으면(매칭 성공했거나, 미매핑 건을 사용자가 직접 수정한 경우)
    //    그 값을 그대로 쓴다 — 비어 있을 때만 옵션ID(external_id)로 자동매칭을 다시 시도한다.
    let prodCd = normalizeString(row.item_code);
    let prodName = normalizeString(row.item_name);

    if (!prodCd) {
      const matched = matchMarketSalesItem(channel, row.external_id);
      if (!matched) {
        await query(`UPDATE market_sales_data SET ecount_status = '미매핑' WHERE id = $1`, [row.id]);
        skippedCount++;
        continue;
      }
      prodCd = matched.PROD_CD;
      prodName = matched.NAME;
    }

    const qty = Number(row.qty) || 0;
    const price = Number(row.unit_price) || 0;

    const result = await registerEcountSale({
      cust,
      whCd,
      lines: [{ PROD_CD: prodCd, QTY: qty, PRICE: price }],
    });

    if (!result.ok || !result.slipNos.length) {
      console.error(`market-sales 이카운트 전송 실패(id=${row.id}, channel=${channel}):`, !result.ok ? result.reason : "슬립번호 없음");
      skippedCount++;
      continue;
    }

    await query(
      `UPDATE market_sales_data SET ecount_status = '전송완료', ecount_slip_no = $2, item_code = $3, item_name = $4 WHERE id = $1`,
      [row.id, result.slipNos.join(","), prodCd, prodName]
    );
    sentCount++;
  }

  return { sentCount, skippedCount };
}

export { isMarketSalesChannel };
