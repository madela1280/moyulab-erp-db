// app/api/market-sales/_lib/naverApiClient.ts
//
// 네이버 커머스API 인증(OAuth2, bcrypt 서명 방식) + 상품주문 상세 조회.
// 공식 문서(apicenter.commerce.naver.com/docs > 커머스API > 인증 / 주문 > 상품주문)
// 2026-11-09 직접 확인 기준으로 구현.

import bcrypt from "bcryptjs";
import type { MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

const BASE_URL = "https://api.commerce.naver.com/external";
const TOKEN_PATH = "/v1/oauth2/token";
const PRODUCT_ORDERS_PATH = "/v1/pay-order/seller/product-orders";

export type NaverCredentials = { clientId: string; clientSecret: string };

const CHANNEL_ENV_PREFIX: Partial<Record<MarketSalesChannel, string>> = {
  smartstore: "NAVER_SMARTSTORE",
};

export function getNaverCredentials(channel: MarketSalesChannel): NaverCredentials | null {
  const prefix = CHANNEL_ENV_PREFIX[channel];
  if (!prefix) return null;

  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// ✅ 전자서명: "client_id_timestamp"를 client_secret을 솔트로 bcrypt 해싱 후 base64 인코딩.
//    (apicenter.commerce.naver.com/docs 인증 항목, 2026-11-09 직접 확인)
function buildSignature(clientId: string, clientSecret: string, timestamp: number): string {
  const password = `${clientId}_${timestamp}`;
  const hashed = bcrypt.hashSync(password, clientSecret);
  return Buffer.from(hashed, "utf8").toString("base64");
}

export type NaverFetchResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export async function getAccessToken(creds: NaverCredentials): Promise<NaverFetchResult<string>> {
  const timestamp = Date.now();
  const signature = buildSignature(creds.clientId, creds.clientSecret, timestamp);

  const params = new URLSearchParams({
    client_id: creds.clientId,
    timestamp: String(timestamp),
    client_secret_sign: signature,
    grant_type: "client_credentials",
    type: "SELF",
  });

  const res = await fetch(`${BASE_URL}${TOKEN_PATH}?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, reason: `TOKEN_HTTP_${res.status}: ${text.slice(0, 300)}` };

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: `TOKEN_NON_JSON: ${text.slice(0, 300)}` };
  }
  if (!json?.access_token) return { ok: false, reason: `TOKEN_NO_ACCESS_TOKEN: ${text.slice(0, 300)}` };
  return { ok: true, data: json.access_token };
}

// ✅ 주문 상세 구조(공식 "상품 주문 정보 구조체" 중 사용하는 필드만 타입으로 뽑음).
export type NaverProductOrderEntry = {
  productOrderId: string;
  productOrderStatus: string;
  paymentDate: string;
  productId: string;
  productName: string;
  productOption: string;
  sellerProductCode: string;
  optionManageCode: string;
  quantity: number;
  totalProductAmount: number;
};

const CANCELED_STATUSES = new Set(["CANCELED", "CANCELED_BY_NOPAYMENT"]);

// ✅ fromISO~toISO(결제일시 기준, KST) 범위의 상품주문 상세를 페이지네이션 돌며 전부 모은다.
//    (최대 300건/페이지 — 공식 문서 기준) 취소/미결제취소 건은 매출이 아니므로 여기서 제외한다.
export async function fetchNaverProductOrders(
  creds: NaverCredentials,
  fromISO: string,
  toISO: string
): Promise<NaverFetchResult<NaverProductOrderEntry[]>> {
  const tokenResult = await getAccessToken(creds);
  if (!tokenResult.ok) return tokenResult;
  const token = tokenResult.data;

  const entries: NaverProductOrderEntry[] = [];
  let page = 1;
  const pageSize = 300;

  while (true) {
    const params = new URLSearchParams({
      from: fromISO,
      to: toISO,
      rangeType: "PAYED_DATETIME",
      pageSize: String(pageSize),
      page: String(page),
    });

    const res = await fetch(`${BASE_URL}${PRODUCT_ORDERS_PATH}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, reason: `ORDERS_HTTP_${res.status}: ${text.slice(0, 300)}` };

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, reason: `ORDERS_NON_JSON: ${text.slice(0, 300)}` };
    }

    // ✅ 2026-11-09 실데이터 확인: data.contents[] 각 원소는 { productOrderId, content: { order, productOrder, delivery } }
    //    형태 — 공식 문서 예시 JSON은 content 래핑 없이 보여줬지만 실제 응답은 한 단계 더 감싸져 있다.
    const list: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.contents) ? json.data.contents : [];

    for (const item of list) {
      const content = item?.content || item || {};
      const order = content?.order || {};
      const po = content?.productOrder || {};
      if (!po?.productOrderId) continue;
      if (CANCELED_STATUSES.has(String(po.productOrderStatus))) continue;

      entries.push({
        productOrderId: String(po.productOrderId),
        productOrderStatus: String(po.productOrderStatus || ""),
        paymentDate: String(order.paymentDate || ""),
        productId: String(po.productId || ""),
        productName: String(po.productName || ""),
        productOption: String(po.productOption || ""),
        sellerProductCode: String(po.sellerProductCode || ""),
        optionManageCode: String(po.optionManageCode || ""),
        quantity: Number(po.quantity) || 0,
        totalProductAmount: Number(po.totalProductAmount) || 0,
      });
    }

    if (list.length < pageSize) break;
    page++;
    if (page > 50) break; // 안전장치(비정상적으로 많은 페이지 방지)
  }

  return { ok: true, data: entries };
}
