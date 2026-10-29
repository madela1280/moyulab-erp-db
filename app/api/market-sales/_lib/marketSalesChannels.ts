// app/api/market-sales/_lib/marketSalesChannels.ts
//
// 오픈마켓(쿠팡/스마트스토어) 매출 채널 정의. 채널별로 이카운트 거래처코드(CUST)가 다르다.
// CUST가 아직 없는 채널은 "" 로 비워두고, 전송 시도하면 명확한 에러로 막는다(추측해서 코드 채우지 않음).

export type MarketSalesChannel = "coupang_jcompany" | "coupang_hanmojeong" | "smartstore";

export const MARKET_SALES_CHANNELS: MarketSalesChannel[] = [
  "coupang_jcompany",
  "coupang_hanmojeong",
  "smartstore",
];

export function isMarketSalesChannel(v: any): v is MarketSalesChannel {
  return MARKET_SALES_CHANNELS.includes(v);
}

export const CHANNEL_LABEL: Record<MarketSalesChannel, string> = {
  coupang_jcompany: "쿠팡(제이컴퍼니)",
  coupang_hanmojeong: "쿠팡(한모정)",
  smartstore: "스마트스토어",
};

// ✅ 2026-10-28 사용자 확인: 쿠팡(윙)-제이컴퍼니 = CUST 00053.
// ✅ 2026-10-29 사용자 확인: 쿠팡(윙)-한모정 = CUST 00002.
// 스마트스토어는 아직 확인 안 됨 — 비워두고, 전송 시도 시 CUST_NOT_CONFIGURED로 막는다.
export const CHANNEL_CUST: Record<MarketSalesChannel, string> = {
  coupang_jcompany: "00053",
  coupang_hanmojeong: "00002",
  smartstore: "",
};

// ⚠️ 창고코드는 기존 이카운트 연동(아모에나, WH_CD "100")과 동일하게 가정해둔 값 — 확인 필요.
export const CHANNEL_WH_CD: Record<MarketSalesChannel, string> = {
  coupang_jcompany: "100",
  coupang_hanmojeong: "100",
  smartstore: "100",
};
