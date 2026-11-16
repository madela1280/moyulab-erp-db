// app/api/market-sales/_lib/coupangApiClient.ts
//
// 쿠팡 Open API 인증(HMAC-SHA256, CEA 방식) + 매출내역 조회(revenue-history) 호출.
// 공식 문서(developers.coupang.com/ko/getting-started/creating-hmac-signature,
// developers.coupang.com/ko/api/settlement/sales-detail-query) 기준으로 구현.

import crypto from "crypto";
import type { MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

const BASE_URL = "https://api-gateway.coupang.com";
const REVENUE_HISTORY_PATH = "/v2/providers/openapi/apis/api/v1/revenue-history";
const ROCKET_GROWTH_ORDERS_PATH_TMPL = "/v2/providers/rg_open_api/apis/api/v1/vendors/{vendorId}/rg/orders";

export type CoupangCredentials = { vendorId: string; accessKey: string; secretKey: string };

// ✅ 2026-10-28 발급: 제이컴퍼니는 접두어 없이 COUPANG_VENDOR_ID 등으로 먼저 등록해뒀다 —
//    하위호환으로 그 이름도 계속 허용한다. 한모정은 아직 키 발급 전이라 비어있으면 null 반환.
const CHANNEL_ENV_PREFIX: Partial<Record<MarketSalesChannel, string>> = {
  coupang_jcompany: "COUPANG_JCOMPANY",
  coupang_hanmojeong: "COUPANG_HANMOJEONG",
};

export function getCoupangCredentials(channel: MarketSalesChannel): CoupangCredentials | null {
  const prefix = CHANNEL_ENV_PREFIX[channel];
  if (!prefix) return null;

  let vendorId = process.env[`${prefix}_VENDOR_ID`];
  let accessKey = process.env[`${prefix}_ACCESS_KEY`];
  let secretKey = process.env[`${prefix}_SECRET_KEY`];

  if (channel === "coupang_jcompany") {
    vendorId = vendorId || process.env.COUPANG_VENDOR_ID;
    accessKey = accessKey || process.env.COUPANG_ACCESS_KEY;
    secretKey = secretKey || process.env.COUPANG_SECRET_KEY;
  }

  if (!vendorId || !accessKey || !secretKey) return null;
  return { vendorId, accessKey, secretKey };
}

function signedDateNow(): string {
  // yyMMddTHHmmssZ, GMT 기준
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${yy}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(
    d.getUTCSeconds()
  )}Z`;
}

function buildAuthorizationHeader(method: string, path: string, query: string, creds: CoupangCredentials): string {
  const signedDate = signedDateNow();
  const message = signedDate + method + path + query;
  const signature = crypto.createHmac("sha256", creds.secretKey).update(message, "utf-8").digest("hex");
  return `CEA algorithm=HmacSHA256, access-key=${creds.accessKey}, signed-date=${signedDate}, signature=${signature}`;
}

export type RevenueHistoryItem = {
  vendorItemId: string;
  vendorItemName: string;
  productId: number;
  productName: string;
  quantity: number;
  saleAmount: number;
};

export type RevenueHistoryEntry = {
  orderId: number;
  saleType: "SALE" | "REFUND";
  saleDate: string;
  recognitionDate: string;
  items: RevenueHistoryItem[];
};

export type RevenueHistoryResult = { ok: true; entries: RevenueHistoryEntry[] } | { ok: false; reason: string };

// ✅ recognitionDateFrom/To(매출인식일 범위, YYYY-MM-DD) 기준으로 전체 페이지를 모아서 반환한다.
export async function fetchCoupangRevenueHistory(
  creds: CoupangCredentials,
  recognitionDateFrom: string,
  recognitionDateTo: string
): Promise<RevenueHistoryResult> {
  const entries: RevenueHistoryEntry[] = [];
  let token = "";
  let guard = 0;

  while (guard < 200) {
    guard++;
    const queryObj: Record<string, string> = {
      vendorId: creds.vendorId,
      recognitionDateFrom,
      recognitionDateTo,
      token,
      maxPerPage: "50",
    };
    const query = new URLSearchParams(queryObj).toString();

    const authorization = buildAuthorizationHeader("GET", REVENUE_HISTORY_PATH, query, creds);

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${REVENUE_HISTORY_PATH}?${query}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          Authorization: authorization,
        },
      });
    } catch (e: any) {
      return { ok: false, reason: `NETWORK_ERROR: ${e?.message || e}` };
    }

    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json || Number(json.code) !== 200) {
      return { ok: false, reason: `API_ERROR(${res.status}): ${JSON.stringify(json)}` };
    }

    const data: any[] = Array.isArray(json.data) ? json.data : [];
    for (const row of data) {
      entries.push({
        orderId: row.orderId,
        saleType: row.saleType,
        saleDate: row.saleDate,
        recognitionDate: row.recognitionDate,
        items: Array.isArray(row.items)
          ? row.items.map((it: any) => ({
              vendorItemId: String(it.vendorItemId),
              vendorItemName: String(it.vendorItemName ?? ""),
              productId: it.productId,
              productName: String(it.productName ?? ""),
              quantity: Number(it.quantity) || 0,
              saleAmount: Number(it.saleAmount) || 0,
            }))
          : [],
      });
    }

    if (!json.hasNext) break;
    token = json.nextToken || "";
    if (!token) break;
  }

  return { ok: true, entries };
}

// ✅ 진단 전용 — 타입 매핑 없이 원본 row를 그대로 반환한다(REFUND 건의 items가 비어있는 이유,
//    실제 필드 구조를 확인하기 위한 용도). 기존 fetchCoupangRevenueHistory는 건드리지 않는다.
export async function fetchCoupangRevenueHistoryRawRows(
  creds: CoupangCredentials,
  recognitionDateFrom: string,
  recognitionDateTo: string
): Promise<{ ok: true; rows: any[] } | { ok: false; reason: string }> {
  const rows: any[] = [];
  let token = "";
  let guard = 0;

  while (guard < 200) {
    guard++;
    const queryObj: Record<string, string> = {
      vendorId: creds.vendorId,
      recognitionDateFrom,
      recognitionDateTo,
      token,
      maxPerPage: "50",
    };
    const query = new URLSearchParams(queryObj).toString();
    const authorization = buildAuthorizationHeader("GET", REVENUE_HISTORY_PATH, query, creds);

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${REVENUE_HISTORY_PATH}?${query}`, {
        method: "GET",
        headers: { "Content-Type": "application/json;charset=UTF-8", Authorization: authorization },
      });
    } catch (e: any) {
      return { ok: false, reason: `NETWORK_ERROR: ${e?.message || e}` };
    }

    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json || Number(json.code) !== 200) {
      return { ok: false, reason: `API_ERROR(${res.status}): ${JSON.stringify(json)}` };
    }

    const data: any[] = Array.isArray(json.data) ? json.data : [];
    rows.push(...data);

    if (!json.hasNext) break;
    token = json.nextToken || "";
    if (!token) break;
  }

  return { ok: true, rows };
}

export type RocketGrowthOrderItem = {
  vendorItemId: string;
  productName: string;
  salesQuantity: number;
  unitSalesPrice: number;
};

export type RocketGrowthOrderEntry = {
  orderId: number;
  paidAt: number;
  orderItems: RocketGrowthOrderItem[];
};

export type RocketGrowthOrdersResult =
  | { ok: true; entries: RocketGrowthOrderEntry[] }
  | { ok: false; reason: string };

// ✅ 로켓그로스 주문 API(목록 쿼리). 매출인식일이 아니라 "결제일(paidDate)" 기준, yyyymmdd 형식,
//    최대 30일 범위 — 정산(매출내역조회) API와 날짜 형식/기준이 다르니 섞어 쓰지 않는다.
export async function fetchCoupangRocketGrowthOrders(
  creds: CoupangCredentials,
  paidDateFromYYYYMMDD: string,
  paidDateToYYYYMMDD: string
): Promise<RocketGrowthOrdersResult> {
  const path = ROCKET_GROWTH_ORDERS_PATH_TMPL.replace("{vendorId}", creds.vendorId);
  const entries: RocketGrowthOrderEntry[] = [];
  let nextToken = "";
  let guard = 0;

  while (guard < 200) {
    guard++;
    const queryObj: Record<string, string> = {
      paidDateFrom: paidDateFromYYYYMMDD,
      paidDateTo: paidDateToYYYYMMDD,
    };
    if (nextToken) queryObj.nextToken = nextToken;
    const queryStr = new URLSearchParams(queryObj).toString();

    const authorization = buildAuthorizationHeader("GET", path, queryStr, creds);

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}?${queryStr}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          Authorization: authorization,
        },
      });
    } catch (e: any) {
      return { ok: false, reason: `NETWORK_ERROR: ${e?.message || e}` };
    }

    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json || Number(json.code) !== 200) {
      return { ok: false, reason: `API_ERROR(${res.status}): ${JSON.stringify(json)}` };
    }

    const data: any[] = Array.isArray(json.data) ? json.data : [];
    for (const row of data) {
      entries.push({
        orderId: row.orderId,
        paidAt: row.paidAt,
        orderItems: Array.isArray(row.orderItems)
          ? row.orderItems.map((it: any) => ({
              vendorItemId: String(it.vendorItemId),
              productName: String(it.productName ?? ""),
              salesQuantity: Number(it.salesQuantity) || 0,
              unitSalesPrice: Number(it.unitSalesPrice) || 0,
            }))
          : [],
      });
    }

    if (!json.nextToken) break;
    nextToken = json.nextToken;
  }

  return { ok: true, entries };
}

const RETURN_REQUESTS_PATH_TMPL = "/v2/providers/openapi/apis/api/v6/vendors/{vendorId}/returnRequests";

// ✅ 진단 전용 — 로켓그로스 매출에서 반품/취소가 전혀 빠지지 않는 문제의 원인 확인용.
//    공식 "반품/취소 요청 목록 조회" API(v6) 원본 응답을 그대로 반환한다(필드 가공 없음).
//    실제 요청/응답 스펙(파라미터명, 응답 envelope)이 문서로 확실히 확인되지 않아서,
//    code 불일치여도(파싱 가능하면) raw json을 그대로 돌려줘서 실제 필드를 눈으로 확인한다.
export async function fetchCoupangReturnRequestsRaw(
  creds: CoupangCredentials,
  fromDateYYYYMMDD: string, // YYYY-MM-DD
  toDateYYYYMMDD: string,
  cancelType?: "CANCEL"
): Promise<{ ok: true; raw: any[]; firstPageRaw: any } | { ok: false; reason: string; firstPageRaw?: any }> {
  const path = RETURN_REQUESTS_PATH_TMPL.replace("{vendorId}", creds.vendorId);
  const raw: any[] = [];
  let nextToken = "";
  let guard = 0;
  let firstPageRaw: any = null;

  // ⚠️ 2026-11-16 확인: createdAtFrom/To는 "yyyy-MM-ddTHH:mm" 형식이 아니면 400 에러.
  const createdAtFrom = `${fromDateYYYYMMDD}T00:00`;
  const createdAtTo = `${toDateYYYYMMDD}T23:59`;

  while (guard < 50) {
    guard++;
    const queryObj: Record<string, string> = {
      searchType: "timeFrame",
      createdAtFrom,
      createdAtTo,
    };
    if (cancelType) queryObj.cancelType = cancelType;
    if (nextToken) queryObj.nextToken = nextToken;
    const queryStr = new URLSearchParams(queryObj).toString();
    const authorization = buildAuthorizationHeader("GET", path, queryStr, creds);

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}?${queryStr}`, {
        method: "GET",
        headers: { "Content-Type": "application/json;charset=UTF-8", Authorization: authorization },
      });
    } catch (e: any) {
      return { ok: false, reason: `NETWORK_ERROR: ${e?.message || e}`, firstPageRaw };
    }

    const json: any = await res.json().catch(() => null);
    if (guard === 1) firstPageRaw = json;

    if (!res.ok || !json) {
      return { ok: false, reason: `API_ERROR(${res.status}): ${JSON.stringify(json)}`, firstPageRaw };
    }

    const data: any[] = Array.isArray(json.data) ? json.data : Array.isArray(json.content) ? json.content : [];
    raw.push(...data);

    const next = json.nextToken;
    if (!next) break;
    nextToken = next;
  }

  return { ok: true, raw, firstPageRaw };
}

// ✅ 진단 전용 — 로켓그로스 취소금액을 자동으로(API로) 가져올 방법을 찾기 위한 범용 조회기.
//    아무 GET 엔드포인트나 경로/쿼리를 그대로 호출해서 원본 응답을 돌려준다(가공 없음).
//    실제 데이터 흐름(ingest)에는 전혀 연결되지 않는다 — 조사용으로만 쓰고 끝낼 것.
export async function fetchCoupangRawProbe(
  creds: CoupangCredentials,
  path: string,
  queryObj: Record<string, string>
): Promise<{ ok: boolean; status: number; json: any }> {
  const queryStr = new URLSearchParams(queryObj).toString();
  const authorization = buildAuthorizationHeader("GET", path, queryStr, creds);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}?${queryStr}`, {
      method: "GET",
      headers: { "Content-Type": "application/json;charset=UTF-8", Authorization: authorization },
    });
  } catch (e: any) {
    return { ok: false, status: 0, json: { networkError: e?.message || String(e) } };
  }

  const json: any = await res.json().catch(async () => ({ nonJson: (await res.text?.()) || null }));
  return { ok: res.ok, status: res.status, json };
}

