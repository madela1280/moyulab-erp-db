// scripts/market-sales/diag-coupang-crosscheck.mjs
//
// 진단 전용(수동 실행) — 쿠팡 API를 직접 재호출해서 집계한 결과와 market_sales_data(DB)에
// 저장된 값을 날짜/옵션ID 단위로 대조한다. "쿠팡에서 가져오기 자체가 누락 없이 됐는가"를
// 확인하기 위한 도구 — 정기 크론에는 포함하지 않는다.
//
// 실행(서버에서, 이미 설정된 COUPANG_JCOMPANY_*/DATABASE_URL 환경변수를 그대로 사용):
//   cd /home/ubuntu/moyulab-erp-db && node scripts/market-sales/diag-coupang-crosscheck.mjs [YYYY-MM-DD ...]
// 날짜를 안 주면 기본값(아래 DEFAULT_DATES)을 쓴다.

import crypto from "crypto";
import pg from "pg";

const BASE_URL = "https://api-gateway.coupang.com";
const REVENUE_HISTORY_PATH = "/v2/providers/openapi/apis/api/v1/revenue-history";
const RG_ORDERS_PATH_TMPL = "/v2/providers/rg_open_api/apis/api/v1/vendors/{vendorId}/rg/orders";

const DEFAULT_DATES = ["2026-10-31", "2026-11-01"];
const CHANNEL = "coupang_jcompany";

const creds = {
  vendorId: process.env.COUPANG_JCOMPANY_VENDOR_ID,
  accessKey: process.env.COUPANG_JCOMPANY_ACCESS_KEY,
  secretKey: process.env.COUPANG_JCOMPANY_SECRET_KEY,
};
if (!creds.vendorId || !creds.accessKey || !creds.secretKey) {
  console.error("COUPANG_JCOMPANY_* 환경변수가 없습니다.");
  process.exit(1);
}

function signedDateNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${yy}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function authHeader(method, path, query) {
  const signedDate = signedDateNow();
  const message = signedDate + method + path + query;
  const signature = crypto.createHmac("sha256", creds.secretKey).update(message, "utf-8").digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${creds.accessKey}, signed-date=${signedDate}, signature=${signature}`;
}

async function fetchRevenueHistory(dateFrom, dateTo) {
  const entries = [];
  let token = "";
  for (let guard = 0; guard < 200; guard++) {
    const queryObj = { vendorId: creds.vendorId, recognitionDateFrom: dateFrom, recognitionDateTo: dateTo, token, maxPerPage: "50" };
    const query = new URLSearchParams(queryObj).toString();
    const auth = authHeader("GET", REVENUE_HISTORY_PATH, query);
    const res = await fetch(`${BASE_URL}${REVENUE_HISTORY_PATH}?${query}`, {
      headers: { "Content-Type": "application/json;charset=UTF-8", Authorization: auth },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || Number(json.code) !== 200) {
      console.error("revenue-history API error:", res.status, JSON.stringify(json));
      break;
    }
    const data = Array.isArray(json.data) ? json.data : [];
    entries.push(...data);
    if (!json.hasNext || !json.nextToken) break;
    token = json.nextToken;
  }
  return entries;
}

async function fetchRgOrders(dateFrom, dateTo) {
  const path = RG_ORDERS_PATH_TMPL.replace("{vendorId}", creds.vendorId);
  const entries = [];
  let nextToken = "";
  for (let guard = 0; guard < 200; guard++) {
    const queryObj = { paidDateFrom: dateFrom, paidDateTo: dateTo };
    if (nextToken) queryObj.nextToken = nextToken;
    const queryStr = new URLSearchParams(queryObj).toString();
    const auth = authHeader("GET", path, queryStr);
    const res = await fetch(`${BASE_URL}${path}?${queryStr}`, {
      headers: { "Content-Type": "application/json;charset=UTF-8", Authorization: auth },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || Number(json.code) !== 200) {
      console.error("rg/orders API error:", res.status, JSON.stringify(json));
      break;
    }
    const data = Array.isArray(json.data) ? json.data : [];
    entries.push(...data);
    if (!json.nextToken) break;
    nextToken = json.nextToken;
  }
  return entries;
}

function kstDateString(epochMs) {
  const kst = new Date(epochMs + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}`;
}

async function main() {
  const targetDates = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_DATES;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  for (const date of targetDates) {
    console.log(`\n========== ${date} ==========`);

    const rhEntries = await fetchRevenueHistory(date, date);
    const rhAgg = new Map();
    let refundCount = 0;
    for (const e of rhEntries) {
      if (e.saleType !== "SALE") { refundCount++; continue; }
      for (const it of e.items || []) {
        const id = String(it.vendorItemId);
        const prev = rhAgg.get(id) || { qty: 0, amt: 0 };
        prev.qty += Number(it.quantity) || 0;
        prev.amt += Number(it.saleAmount) || 0;
        rhAgg.set(id, prev);
      }
    }
    console.log(`[일반매출-재조회] entries=${rhEntries.length} (SALE 품목종류=${rhAgg.size}, REFUND건=${refundCount})`);

    const fromD = new Date(date + "T00:00:00Z"); fromD.setUTCDate(fromD.getUTCDate() - 1);
    const toD = new Date(date + "T00:00:00Z"); toD.setUTCDate(toD.getUTCDate() + 1);
    const pad = (n) => String(n).padStart(2, "0");
    const toYmd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
    const rgEntries = await fetchRgOrders(toYmd(fromD), toYmd(toD));
    const rgForDate = rgEntries.filter((e) => kstDateString(e.paidAt) === date);
    const rgAgg = new Map();
    for (const e of rgForDate) {
      for (const it of e.orderItems || []) {
        const id = String(it.vendorItemId);
        const prev = rgAgg.get(id) || { qty: 0, amt: 0 };
        prev.qty += Number(it.salesQuantity) || 0;
        prev.amt += (Number(it.salesQuantity) || 0) * (Number(it.unitSalesPrice) || 0);
        rgAgg.set(id, prev);
      }
    }
    console.log(`[로켓그로스-재조회] 범위내총건=${rgEntries.length} 해당날짜건=${rgForDate.length} (품목종류=${rgAgg.size})`);

    const dbRows = await pool.query(
      `SELECT external_id, item_code, qty, unit_price, total_amt, ecount_status FROM market_sales_data WHERE channel = $1 AND sale_date = $2 ORDER BY external_id`,
      [CHANNEL, date]
    );
    const dbByExternalId = new Map(dbRows.rows.map((r) => [r.external_id, r]));
    console.log(`[DB 저장값] 행수=${dbRows.rows.length}`);

    console.log("--- 일반매출 대조 (옵션ID: API재조회 qty/amt vs DB qty/total_amt) ---");
    for (const [id, agg] of rhAgg.entries()) {
      const externalId = `${date}:${id}`;
      const dbRow = dbByExternalId.get(externalId);
      const mark = dbRow ? "" : " ⚠️ DB에 없음(누락 의심)";
      console.log(`  ${id}: API qty=${agg.qty} amt=${agg.amt} | DB qty=${dbRow ? Number(dbRow.qty) : null} total_amt=${dbRow ? Number(dbRow.total_amt) : null}${mark}`);
    }
    console.log("--- 로켓그로스 대조 ---");
    for (const [id, agg] of rgAgg.entries()) {
      const externalId = `RG:${date}:${id}`;
      const dbRow = dbByExternalId.get(externalId);
      const mark = dbRow ? "" : " ⚠️ DB에 없음(누락 의심)";
      console.log(`  ${id}: API qty=${agg.qty} amt=${agg.amt} | DB qty=${dbRow ? Number(dbRow.qty) : null} total_amt=${dbRow ? Number(dbRow.total_amt) : null}${mark}`);
    }
  }

  await pool.end();
}

main().catch((e) => { console.error("script error:", e); process.exit(1); });
