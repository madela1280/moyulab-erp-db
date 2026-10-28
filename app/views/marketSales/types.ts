// app/views/marketSales/types.ts

export type MarketSalesChannel = "coupang_jcompany" | "coupang_hanmojeong" | "smartstore";

export type MarketSalesRow = {
  id: number;
  channel: MarketSalesChannel;
  일자: string | null;
  마켓상품명: string;
  품목: string;
  품목명: string;
  수량: number;
  단가: number;
  공급가액: number;
  부가세: number;
  합계: number;
  이카운트전송상태: "전송완료" | "미전송" | "미매핑";
};
