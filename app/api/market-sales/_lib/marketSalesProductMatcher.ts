// app/api/market-sales/_lib/marketSalesProductMatcher.ts
//
// 쿠팡 옵션ID(vendorItemId, market_sales_data.external_id) -> 이카운트 품목코드(PROD_CD) 매칭표.
// ⚠️ 가격은 여기 안 둔다 — 단가는 "매출(원)÷판매량"으로 수집 시점에 계산해서 market_sales_data에
//    바로 저장해두는 값이라, 전송 시에는 그 저장된 단가를 그대로 쓴다(이카운트 매칭 = 코드/이름만).
//
// coupang_jcompany: 2026-10-28 "제이컴퍼니 쿠팡 상품매핑.xlsx" 37건 그대로 반영.
// coupang_hanmojeong / smartstore: 아직 매핑 자료 없음 — 비어 있어서 전부 미매칭으로 처리된다.

import type { MarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

export type MatchedLine = { PROD_CD: string; NAME: string; baseQty: number };

type ProductEntry = { vendorItemId: string; PROD_CD: string; NAME: string; baseQty: number };

const PRODUCT_TABLE: Record<MarketSalesChannel, ProductEntry[]> = {
  coupang_jcompany: [
    { vendorItemId: "84227408190", PROD_CD: "U0002", NAME: "제이컴퍼니 - 라놀크림", baseQty: 1 },
    { vendorItemId: "87336392179", PROD_CD: "U0002", NAME: "제이컴퍼니 - 라놀크림", baseQty: 1 },
    { vendorItemId: "88036221595", PROD_CD: "U0007", NAME: "제이컴퍼니 - 메델라 유두보호기 L", baseQty: 1 },
    { vendorItemId: "88105493009", PROD_CD: "U0006", NAME: "제이컴퍼니 - 메델라 유두보호기 M", baseQty: 1 },
    { vendorItemId: "93081433861", PROD_CD: "U0006", NAME: "제이컴퍼니 - 메델라 유두보호기 M", baseQty: 1 },
    { vendorItemId: "88036221573", PROD_CD: "U0006", NAME: "제이컴퍼니 - 메델라 유두보호기 M", baseQty: 1 },
    { vendorItemId: "90958391882", PROD_CD: "U0006", NAME: "제이컴퍼니 - 메델라 유두보호기 M", baseQty: 1 },
    { vendorItemId: "91216193218", PROD_CD: "U0006", NAME: "제이컴퍼니 - 메델라 유두보호기 M", baseQty: 1 },
    { vendorItemId: "88036221612", PROD_CD: "U0005", NAME: "제이컴퍼니 - 메델라 유두보호기 S", baseQty: 1 },
    { vendorItemId: "91104772666", PROD_CD: "U0010", NAME: "제이컴퍼니 - 메델라 구순구개열 특수 젖병 150ml", baseQty: 1 },
    { vendorItemId: "91104772661", PROD_CD: "U0010", NAME: "제이컴퍼니 - 메델라 구순구개열 특수 젖병 150ml", baseQty: 1 },
    { vendorItemId: "95405556138", PROD_CD: "U0010", NAME: "제이컴퍼니 - 메델라 구순구개열 특수 젖병 150ml", baseQty: 1 },
    { vendorItemId: "83812283313", PROD_CD: "U0002", NAME: "제이컴퍼니 - 라놀크림", baseQty: 1 },
    { vendorItemId: "88049723345", PROD_CD: "U0009", NAME: "제이컴퍼니 - 모유랩 가슴찜질", baseQty: 1 },
    { vendorItemId: "93253064134", PROD_CD: "U0009", NAME: "제이컴퍼니 - 모유랩 가슴찜질", baseQty: 1 },
    { vendorItemId: "90083489172", PROD_CD: "U0009", NAME: "제이컴퍼니 - 모유랩 가슴찜질", baseQty: 1 },
    { vendorItemId: "90912022168", PROD_CD: "U0009", NAME: "제이컴퍼니 - 모유랩 가슴찜질", baseQty: 1 },
    { vendorItemId: "95860579880", PROD_CD: "U0009", NAME: "제이컴퍼니 - 모유랩 가슴찜질", baseQty: 1 },
    { vendorItemId: "95690911259", PROD_CD: "SET0017", NAME: "메델라 유두보호기 낱개 M 1p + 본품케이스", baseQty: 1 },
    { vendorItemId: "95842618609", PROD_CD: "SET0017", NAME: "메델라 유두보호기 낱개 M 1p + 본품케이스", baseQty: 1 },
    { vendorItemId: "95690911262", PROD_CD: "SET0013", NAME: "메델라 유두보호기 낱개 M 1p + 이지클린케이스 보라", baseQty: 1 },
    { vendorItemId: "95961158631", PROD_CD: "SET0013", NAME: "메델라 유두보호기 낱개 M 1p + 이지클린케이스 보라", baseQty: 1 },
    { vendorItemId: "95690911257", PROD_CD: "SET0016", NAME: "메델라 유두보호기 낱개 S 1p + 본품케이스", baseQty: 1 },
    { vendorItemId: "96052627928", PROD_CD: "SET0016", NAME: "메델라 유두보호기 낱개 S 1p + 본품케이스", baseQty: 1 },
    { vendorItemId: "95690911273", PROD_CD: "SET0011", NAME: "메델라 유두보호기 낱개 S 1p + 이지클린케이스 보라", baseQty: 1 },
    { vendorItemId: "96060828745", PROD_CD: "SET0011", NAME: "메델라 유두보호기 낱개 S 1p + 이지클린케이스 보라", baseQty: 1 },
    { vendorItemId: "95690911295", PROD_CD: "SET0017", NAME: "메델라 유두보호기 낱개 M 1p + 본품케이스", baseQty: 2 },
    { vendorItemId: "95690911293", PROD_CD: "SET0013", NAME: "메델라 유두보호기 낱개 M 1p + 이지클린케이스 보라", baseQty: 2 },
    { vendorItemId: "95690911301", PROD_CD: "SET0016", NAME: "메델라 유두보호기 낱개 S 1p + 본품케이스", baseQty: 2 },
    { vendorItemId: "95690911297", PROD_CD: "SET0011", NAME: "메델라 유두보호기 낱개 S 1p + 이지클린케이스 보라", baseQty: 2 },
    { vendorItemId: "95690911294", PROD_CD: "SET0017", NAME: "메델라 유두보호기 낱개 M 1p + 본품케이스", baseQty: 3 },
    { vendorItemId: "95690911303", PROD_CD: "SET0013", NAME: "메델라 유두보호기 낱개 M 1p + 이지클린케이스 보라", baseQty: 3 },
    { vendorItemId: "95690911296", PROD_CD: "SET0016", NAME: "메델라 유두보호기 낱개 S 1p + 본품케이스", baseQty: 3 },
    { vendorItemId: "95690911298", PROD_CD: "SET0011", NAME: "메델라 유두보호기 낱개 S 1p + 이지클린케이스 보라", baseQty: 3 },
    { vendorItemId: "84178524399", PROD_CD: "U0001", NAME: "제이컴퍼니 - 카베지크림", baseQty: 1 },
    { vendorItemId: "87067610952", PROD_CD: "U0001", NAME: "제이컴퍼니 - 카베지크림", baseQty: 1 },
  ],
  // coupang_hanmojeong: 2026-10-29 "쿠팡윙 이카운트 매핑.xlsx" 15건 그대로 반영. 기본수량은 전부 1.
  coupang_hanmojeong: [
    { vendorItemId: "93376662960", PROD_CD: "M0001", NAME: "메델라 유두보호기 L", baseQty: 1 },
    { vendorItemId: "90738192851", PROD_CD: "M0001", NAME: "메델라 유두보호기 L", baseQty: 1 },
    { vendorItemId: "90586732048", PROD_CD: "M0001", NAME: "메델라 유두보호기 L", baseQty: 1 },
    { vendorItemId: "93833804354", PROD_CD: "M0003", NAME: "메델라 유두보호기 S", baseQty: 1 },
    { vendorItemId: "90782114534", PROD_CD: "M0003", NAME: "메델라 유두보호기 S", baseQty: 1 },
    { vendorItemId: "70864217160", PROD_CD: "M0001", NAME: "메델라 유두보호기 L", baseQty: 1 },
    { vendorItemId: "90586732100", PROD_CD: "M0002", NAME: "메델라 유두보호기 M", baseQty: 1 },
    { vendorItemId: "93634724939", PROD_CD: "M0002", NAME: "메델라 유두보호기 M", baseQty: 1 },
    { vendorItemId: "70864217141", PROD_CD: "M0002", NAME: "메델라 유두보호기 M", baseQty: 1 },
    { vendorItemId: "87862832851", PROD_CD: "M0003", NAME: "메델라 유두보호기 S", baseQty: 1 },
    { vendorItemId: "86472850051", PROD_CD: "E0027", NAME: "닥터브라운 와이드캡", baseQty: 1 },
    { vendorItemId: "86472850068", PROD_CD: "E0028", NAME: "더블하트 와이드캡", baseQty: 1 },
    { vendorItemId: "86472850036", PROD_CD: "E0029", NAME: "모윰 와이드캡", baseQty: 1 },
    { vendorItemId: "86472850045", PROD_CD: "E0026", NAME: "스펙트라 / 아벤트 와이드캡", baseQty: 1 },
    { vendorItemId: "86479397866", PROD_CD: "M0155", NAME: "메델라 퀵클린 5매", baseQty: 1 },
  ],
  smartstore: [],
};

// ✅ 매칭 입력값은 쿠팡 옵션ID(vendorItemId, external_id) — 이름(옵션명)이 아니라 ID로 정확히 매칭한다.
export function matchMarketSalesItem(channel: MarketSalesChannel, vendorItemId: string): MatchedLine | null {
  const table = PRODUCT_TABLE[channel] || [];
  const id = String(vendorItemId ?? "").trim();
  if (!id) return null;
  const entry = table.find((e) => e.vendorItemId === id);
  if (!entry) return null;
  return { PROD_CD: entry.PROD_CD, NAME: entry.NAME, baseQty: entry.baseQty };
}

export type ProductGroup = { PROD_CD: string; NAME: string; vendorItemIds: string[] };

// ✅ 로켓재고 조회용 — 같은 PROD_CD에 여러 옵션ID(vendorItemId)가 묶여있을 수 있어서
//    PROD_CD 기준으로 묶어서 반환한다(재고는 물리적 상품 기준이라 옵션ID별로 따로 안 보여줌).
export function getProductGroupsForChannel(channel: MarketSalesChannel): ProductGroup[] {
  const table = PRODUCT_TABLE[channel] || [];
  const byProdCd = new Map<string, ProductGroup>();
  for (const entry of table) {
    const group = byProdCd.get(entry.PROD_CD);
    if (group) group.vendorItemIds.push(entry.vendorItemId);
    else byProdCd.set(entry.PROD_CD, { PROD_CD: entry.PROD_CD, NAME: entry.NAME, vendorItemIds: [entry.vendorItemId] });
  }
  return Array.from(byProdCd.values());
}
