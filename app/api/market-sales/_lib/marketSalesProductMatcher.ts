// app/api/market-sales/_lib/marketSalesProductMatcher.ts
//
// 쿠팡/스마트스토어 "품목명"(원본 상품명) -> 이카운트 품목코드(PROD_CD) 매칭표.
// ⚠️ 2026-10-28 기준 매핑 자료가 아직 없음 — 비어 있는 테이블이라 전부 미매칭으로 처리된다.
//    상품명 엑셀 받으면 롯데택배(ecountAmoenaMatcher.ts)와 같은 방식으로 채워 넣을 예정.

import type { MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

export type MatchedLine = { PROD_CD: string; PRICE: number; NAME: string };

const PRODUCT_TABLE: Record<MarketSalesChannel, { key: string; PROD_CD: string; PRICE: number; NAME: string }[]> = {
  coupang_jcompany: [],
  coupang_hanmojeong: [],
  smartstore: [],
};

// ✅ 매칭 입력값은 "마켓상품명"(채널 원본 상품명, market_item_name) — 매칭된 PROD_CD/공식 품목명을 돌려준다.
export function matchMarketSalesItem(channel: MarketSalesChannel, marketItemName: string): MatchedLine | null {
  const table = PRODUCT_TABLE[channel] || [];
  const name = String(marketItemName ?? "");
  for (const entry of table) {
    if (name.includes(entry.key)) return { PROD_CD: entry.PROD_CD, PRICE: entry.PRICE, NAME: entry.NAME };
  }
  return null;
}
