"use client";

// app/views/marketSales/SmartStoreView.tsx
//
// "이카운트 > 스마트스토어" 화면. 쿠팡과 동일한 양식(MarketSalesView)을 channel="smartstore"로 고정해서 사용.
// ⚠️ 네이버 커머스API센터 키 발급 전까지는 데이터 자동수집이 없어 빈 화면으로 뜬다.

import MarketSalesView from "@/views/marketSales/MarketSalesView";

export default function SmartStoreView() {
  return <MarketSalesView channel="smartstore" title="스마트스토어" />;
}
