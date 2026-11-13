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
  orderId: string; // ✅ 2026-11-12 추가: 유축기처럼 한 주문이 여러 productOrderId로 쪼개질 때 묶는 키.
  productId: string;
  productName: string;
  productOption: string;
  sellerProductCode: string;
  optionManageCode: string;
  quantity: number;
  // ⚠️ 2026-11-13 확인(실데이터): totalProductAmount는 "할인 적용 전" 금액이다(예: 정가 28000원,
  //    할인 8000원이면 totalProductAmount=28000, 실제 고객 결제액은 totalPaymentAmount=20000).
  //    매출은 반드시 totalPaymentAmount(실결제액, 배송비 제외) 기준으로 써야 한다 — totalProductAmount를
  //    쓰면 할인분만큼 매출이 부풀려진다(실데이터로 확인된 심각한 과대집계 원인, 2026-11-13).
  totalProductAmount: number; // 참고용으로만 남김(할인 전 금액) — 매출 계산에 쓰지 않는다.
  totalPaymentAmount: number; // ✅ 실제 매출로 써야 하는 필드(할인 반영된 실결제액, 배송비 제외).
  // ✅ 2026-11-12 추가(반품 처리용) — 실데이터로 확인: productOrderStatus="RETURNED"가 되어도
  //    totalPaymentAmount/quantity는 원래값 그대로 남고, remainQuantity/remainPaymentAmount가
  //    반품된 만큼 줄어든다(전체반품이면 0). "원래값 - remain값" = 실제 반품 처리된 수량/금액.
  remainQuantity: number;
  remainProductAmount: number; // 참고용(할인 전 기준 remain) — 쓰지 않는다.
  remainPaymentAmount: number; // ✅ 반품/취소 금액 계산에 써야 하는 필드(실결제액 기준 remain).
  // ✅ 2026-11-12 추가 — 반품/취소는 "결제일"이 아니라 "처리완료일" 기준으로 집계해야 한다는 사용자
  //    확인. completedClaims[0].claimCompleteOperationDate가 RETURN/CANCEL 공통으로 존재하는
  //    실제 처리완료 일시(반품: returnCompletedDate, 취소: cancelCompletedDate와 동일값).
  claimCompletedDate: string;
};

// ✅ 2026-11-12: CANCELED_BY_NOPAYMENT(미결제취소, 결제 자체가 안 된 건)만 제외한다. 일반 CANCELED
//    (결제 후 취소)는 더 이상 걸러내지 않는다 — RETURNED와 동일하게 매출/반품(취소) 독립 행으로
//    처리해야 ERP에서 취소 이력이 보인다(ingest 쪽 marketSalesSmartstoreIngest.ts /
//    marketSalesSmartstorePumpIngest.ts 참고).
const CANCELED_STATUSES = new Set(["CANCELED_BY_NOPAYMENT"]);

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

      const completedClaims: any[] = Array.isArray(content?.completedClaims) ? content.completedClaims : [];
      const claimCompletedDate = String(completedClaims[0]?.claimCompleteOperationDate || "");

      entries.push({
        productOrderId: String(po.productOrderId),
        productOrderStatus: String(po.productOrderStatus || ""),
        paymentDate: String(order.paymentDate || ""),
        claimCompletedDate,
        orderId: String(order.orderId || ""),
        productId: String(po.productId || ""),
        productName: String(po.productName || ""),
        productOption: String(po.productOption || ""),
        sellerProductCode: String(po.sellerProductCode || ""),
        optionManageCode: String(po.optionManageCode || ""),
        quantity: Number(po.quantity) || 0,
        totalProductAmount: Number(po.totalProductAmount) || 0,
        totalPaymentAmount: Number(po.totalPaymentAmount) || 0,
        remainQuantity: Number(po.remainQuantity ?? po.quantity) || 0,
        remainProductAmount: Number(po.remainProductAmount ?? po.totalProductAmount) || 0,
        remainPaymentAmount: Number(po.remainPaymentAmount ?? po.totalPaymentAmount) || 0,
      });
    }

    if (list.length < pageSize) break;
    page++;
    if (page > 50) break; // 안전장치(비정상적으로 많은 페이지 방지)
  }

  return { ok: true, data: entries };
}
