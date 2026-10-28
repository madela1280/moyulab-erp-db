// app/api/market-sales/_lib/coupangApiClient.ts
//
// 쿠팡 Open API 인증(HMAC-SHA256, CEA 방식) + 매출내역 조회(revenue-history) 호출.
// 공식 문서(developers.coupang.com/ko/getting-started/creating-hmac-signature,
// developers.coupang.com/ko/api/settlement/sales-detail-query) 기준으로 구현.

import crypto from "crypto";
import type { MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

const BASE_URL = "https://api-gateway.coupang.com";
const REVENUE_HISTORY_PATH = "/v2/providers/openapi/apis/api/v1/revenue-history";

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
