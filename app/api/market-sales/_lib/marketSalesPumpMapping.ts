// app/api/market-sales/_lib/marketSalesPumpMapping.ts
//
// 스마트스토어 유축기(대여) 상품 전용 매핑표. 일반상품(marketSalesProductMatcher.ts)과 매칭 방식이
// 완전히 다르다 — 한 주문이 여러 productOrderId 줄(기본상품+대여기간선택+[재구매/연장] 줄)로 쪼개져서
// 오기 때문에, 품목코드는 "상품번호(productId) + 기기(device, 스윙 계열만) + 대여기간(durationKey) +
// 연장여부(isExtension)" 조합으로 결정한다. 실제 합산/판별 로직은 marketSalesSmartstorePumpIngest.ts.
//
// ✅ 2026-11-12 사용자가 이카운트 품목코드 전체 캡처본(심포니/락티나/스윙맥시/스윙FLEX/프리스타일)을
//    줘서 전부 반영함. 프리스타일(M0250~M0257)은 실제 주문 샘플은 아직 못 봤지만(기존 유축기 매핑
//    엑셀엔 없었음) 코드가 있으니 미리 추가 — 실제 선택2 텍스트가 "프리스타일"과 정확히 일치하는지는
//    실데이터로 확인 필요.

export const PUMP_PRODUCT_IDS = new Set<string>(["4937186526", "4937201859", "4941912837"]);

export type PumpMatchedItem = { PROD_CD: string; NAME: string };

type PumpEntry = {
  productId: string;
  device: string | null; // 심포니/락티나는 null(기기 구분 없음). 스윙 계열만 "스윙FLEX" | "스윙맥시".
  durationKey: string; // "2주" | "3주" | ... | "1개월" | "2개월" | "3개월"
  isExtension: boolean;
  PROD_CD: string;
  NAME: string;
};

const PUMP_TABLE: PumpEntry[] = [
  // 심포니 (4937186526) — 신규 최소 2주, 1주는 연장만 존재
  { productId: "4937186526", device: null, durationKey: "1주", isExtension: true, PROD_CD: "M0023", NAME: "[연장]메델라 심포니 유축기 대여 1주" },
  { productId: "4937186526", device: null, durationKey: "2주", isExtension: false, PROD_CD: "M0024", NAME: "메델라 심포니 유축기 대여 2주" },
  { productId: "4937186526", device: null, durationKey: "2주", isExtension: true, PROD_CD: "M0031", NAME: "[연장] 심포니 유축기 대여 2주" },
  { productId: "4937186526", device: null, durationKey: "3주", isExtension: false, PROD_CD: "M0025", NAME: "메델라 심포니 유축기 대여 3주" },
  { productId: "4937186526", device: null, durationKey: "3주", isExtension: true, PROD_CD: "M0032", NAME: "[연장] 심포니 유축기 대여 3주" },
  { productId: "4937186526", device: null, durationKey: "4주", isExtension: false, PROD_CD: "M0026", NAME: "메델라 심포니 유축기 대여 4주" },
  { productId: "4937186526", device: null, durationKey: "4주", isExtension: true, PROD_CD: "M0033", NAME: "[연장] 심포니 유축기 대여 4주" },
  { productId: "4937186526", device: null, durationKey: "6주", isExtension: false, PROD_CD: "M0027", NAME: "메델라 심포니 유축기 대여 6주" },
  { productId: "4937186526", device: null, durationKey: "6주", isExtension: true, PROD_CD: "M0034", NAME: "[연장] 심포니 유축기 대여 6주" },
  { productId: "4937186526", device: null, durationKey: "8주", isExtension: false, PROD_CD: "M0028", NAME: "메델라 심포니 유축기 대여 8주" },
  { productId: "4937186526", device: null, durationKey: "8주", isExtension: true, PROD_CD: "M0035", NAME: "[연장] 심포니 유축기 대여 8주" },
  { productId: "4937186526", device: null, durationKey: "12주", isExtension: false, PROD_CD: "M0029", NAME: "메델라 심포니 유축기 대여 12주" },
  { productId: "4937186526", device: null, durationKey: "12주", isExtension: true, PROD_CD: "M0036", NAME: "[연장] 심포니 유축기 대여 12주" },
  { productId: "4937186526", device: null, durationKey: "16주", isExtension: false, PROD_CD: "M0030", NAME: "메델라 심포니 유축기 대여 16주" },
  { productId: "4937186526", device: null, durationKey: "16주", isExtension: true, PROD_CD: "M0037", NAME: "[연장] 심포니 유축기 대여 16주" },

  // 락티나 (4937201859) — 신규 최소 2주, 1주는 연장만 존재
  { productId: "4937201859", device: null, durationKey: "1주", isExtension: true, PROD_CD: "M0008", NAME: "[연장] 메델라 락티나 유축기 대여 1주" },
  { productId: "4937201859", device: null, durationKey: "2주", isExtension: false, PROD_CD: "M0009", NAME: "개인대여 - 메델라 락티나 유축기 대여 2주" },
  { productId: "4937201859", device: null, durationKey: "2주", isExtension: true, PROD_CD: "M0016", NAME: "[연장] 락티나 유축기 대여 2주" },
  { productId: "4937201859", device: null, durationKey: "3주", isExtension: false, PROD_CD: "M0010", NAME: "개인대여 - 메델라 락티나 유축기 대여 3주" },
  { productId: "4937201859", device: null, durationKey: "3주", isExtension: true, PROD_CD: "M0017", NAME: "[연장] 락티나 유축기 대여 3주" },
  { productId: "4937201859", device: null, durationKey: "4주", isExtension: false, PROD_CD: "M0011", NAME: "개인대여 - 메델라 락티나 유축기 대여 4주" },
  { productId: "4937201859", device: null, durationKey: "4주", isExtension: true, PROD_CD: "M0018", NAME: "[연장] 락티나 유축기 대여 4주" },
  { productId: "4937201859", device: null, durationKey: "6주", isExtension: false, PROD_CD: "M0012", NAME: "개인대여 - 메델라 락티나 유축기 대여 6주" },
  { productId: "4937201859", device: null, durationKey: "6주", isExtension: true, PROD_CD: "M0019", NAME: "[연장] 락티나 유축기 대여 6주" },
  { productId: "4937201859", device: null, durationKey: "8주", isExtension: false, PROD_CD: "M0013", NAME: "개인대여 - 메델라 락티나 유축기 대여 8주" },
  { productId: "4937201859", device: null, durationKey: "8주", isExtension: true, PROD_CD: "M0020", NAME: "[연장] 락티나 유축기 대여 8주" },
  { productId: "4937201859", device: null, durationKey: "12주", isExtension: false, PROD_CD: "M0014", NAME: "개인대여 - 메델라 락티나 유축기 대여 12주" },
  { productId: "4937201859", device: null, durationKey: "12주", isExtension: true, PROD_CD: "M0021", NAME: "[연장] 락티나 유축기 대여 12주" },
  { productId: "4937201859", device: null, durationKey: "16주", isExtension: false, PROD_CD: "M0015", NAME: "개인대여 - 메델라 락티나 유축기 대여 16주" },
  { productId: "4937201859", device: null, durationKey: "16주", isExtension: true, PROD_CD: "M0022", NAME: "[연장] 락티나 유축기 대여 16주" },

  // 스윙 계열 (4941912837) — 기기(device)로 FLEX/맥시/프리스타일 구분
  { productId: "4941912837", device: "스윙FLEX", durationKey: "1개월", isExtension: false, PROD_CD: "M0258", NAME: "메델라 스윙 유축기 대여 (1개월)" },
  { productId: "4941912837", device: "스윙FLEX", durationKey: "1개월", isExtension: true, PROD_CD: "M0262", NAME: "[연장대여] 메델라 스윙 유축기 대여 (1개월)" },
  { productId: "4941912837", device: "스윙FLEX", durationKey: "2개월", isExtension: false, PROD_CD: "M0259", NAME: "메델라 스윙 유축기 대여 (2개월)" },
  { productId: "4941912837", device: "스윙FLEX", durationKey: "2개월", isExtension: true, PROD_CD: "M0263", NAME: "[연장대여] 메델라 스윙 유축기 대여 (2개월)" },
  { productId: "4941912837", device: "스윙FLEX", durationKey: "3개월", isExtension: false, PROD_CD: "M0260", NAME: "메델라 스윙 유축기 대여 (3개월)" },
  { productId: "4941912837", device: "스윙FLEX", durationKey: "3개월", isExtension: true, PROD_CD: "M0264", NAME: "[연장대여] 메델라 스윙 유축기 대여 (3개월)" },
  { productId: "4941912837", device: "스윙FLEX", durationKey: "4개월", isExtension: false, PROD_CD: "M0261", NAME: "메델라 스윙 유축기 대여 (4개월)" },
  { productId: "4941912837", device: "스윙FLEX", durationKey: "4개월", isExtension: true, PROD_CD: "M0265", NAME: "[연장대여] 메델라 스윙 유축기 대여 (4개월)" },

  { productId: "4941912837", device: "스윙맥시", durationKey: "1개월", isExtension: false, PROD_CD: "M0242", NAME: "메델라 스윙맥시 유축기 대여(1개월)" },
  { productId: "4941912837", device: "스윙맥시", durationKey: "1개월", isExtension: true, PROD_CD: "M0246", NAME: "[연장대여] 메델라 스윙맥시 유축기 대여(1개월)" },
  { productId: "4941912837", device: "스윙맥시", durationKey: "2개월", isExtension: false, PROD_CD: "M0243", NAME: "메델라 스윙맥시 유축기 대여(2개월)" },
  { productId: "4941912837", device: "스윙맥시", durationKey: "2개월", isExtension: true, PROD_CD: "M0247", NAME: "[연장대여] 메델라 스윙맥시 유축기 대여(2개월)" },
  { productId: "4941912837", device: "스윙맥시", durationKey: "3개월", isExtension: false, PROD_CD: "M0244", NAME: "메델라 스윙맥시 유축기 대여(3개월)" },
  { productId: "4941912837", device: "스윙맥시", durationKey: "3개월", isExtension: true, PROD_CD: "M0248", NAME: "[연장대여] 메델라 스윙맥시 유축기 대여(3개월)" },
  { productId: "4941912837", device: "스윙맥시", durationKey: "4개월", isExtension: false, PROD_CD: "M0245", NAME: "메델라 스윙맥시 유축기 대여(4개월)" },
  { productId: "4941912837", device: "스윙맥시", durationKey: "4개월", isExtension: true, PROD_CD: "M0249", NAME: "[연장대여] 메델라 스윙맥시 유축기 대여(4개월)" },

  { productId: "4941912837", device: "프리스타일", durationKey: "1개월", isExtension: false, PROD_CD: "M0250", NAME: "메델라 프리스타일 유축기 대여(1개월)" },
  { productId: "4941912837", device: "프리스타일", durationKey: "1개월", isExtension: true, PROD_CD: "M0254", NAME: "[연장대여] 메델라 프리스타일 유축기 대여(1개월)" },
  { productId: "4941912837", device: "프리스타일", durationKey: "2개월", isExtension: false, PROD_CD: "M0251", NAME: "메델라 프리스타일 유축기 대여(2개월)" },
  { productId: "4941912837", device: "프리스타일", durationKey: "2개월", isExtension: true, PROD_CD: "M0255", NAME: "[연장대여] 메델라 프리스타일 유축기 대여(2개월)" },
  { productId: "4941912837", device: "프리스타일", durationKey: "3개월", isExtension: false, PROD_CD: "M0252", NAME: "메델라 프리스타일 유축기 대여(3개월)" },
  { productId: "4941912837", device: "프리스타일", durationKey: "3개월", isExtension: true, PROD_CD: "M0256", NAME: "[연장대여] 메델라 프리스타일 유축기 대여(3개월)" },
  { productId: "4941912837", device: "프리스타일", durationKey: "4개월", isExtension: false, PROD_CD: "M0253", NAME: "메델라 프리스타일 유축기 대여(4개월)" },
  { productId: "4941912837", device: "프리스타일", durationKey: "4개월", isExtension: true, PROD_CD: "M0257", NAME: "[연장대여] 메델라 프리스타일 유축기 대여(4개월)" },
];

export function matchPumpItem(
  productId: string,
  device: string | null,
  durationKey: string,
  isExtension: boolean
): PumpMatchedItem | null {
  const entry = PUMP_TABLE.find(
    (e) => e.productId === productId && e.device === device && e.durationKey === durationKey && e.isExtension === isExtension
  );
  if (!entry) return null;
  return { PROD_CD: entry.PROD_CD, NAME: entry.NAME };
}
