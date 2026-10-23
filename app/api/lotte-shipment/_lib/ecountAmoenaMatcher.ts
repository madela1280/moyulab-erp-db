// app/api/lotte-shipment/_lib/ecountAmoenaMatcher.ts
//
// 롯데택배 상품명 -> 이카운트 "아모에나/장루판매(합포장)" 거래처(CUST 00043) 품목코드 매칭.
// 2026-10-22 사용자와 함께 실제 데이터로 검증한 규칙을 그대로 코드화한 것.

export const AMOENA_CUST = "00043";
export const AMOENA_WH_CD = "100";

export type AmoenaSaleLine = { PROD_CD: string; QTY: number; PRICE: number };

// ✅ 품목코드 68개(2026-10-22 최신본). key는 롯데 상품명에 실제로 찍히는 핵심 식별자(모델번호/숫자).
const PRODUCT_TABLE: { key: string; PROD_CD: string; PRICE: number }[] = [
  { key: "363", PROD_CD: "N0001", PRICE: 468000 },
  { key: "367", PROD_CD: "N0002", PRICE: 330000 },
  { key: "354L", PROD_CD: "N0003", PRICE: 468000 },
  { key: "354R", PROD_CD: "N0004", PRICE: 468000 },
  { key: "458", PROD_CD: "N0005", PRICE: 468000 },
  { key: "368", PROD_CD: "N0006", PRICE: 468000 },
  { key: "342", PROD_CD: "N0007", PRICE: 468000 },
  { key: "385", PROD_CD: "N0008", PRICE: 468000 },
  { key: "392", PROD_CD: "N0009", PRICE: 468000 },
  { key: "382", PROD_CD: "N0010", PRICE: 468000 },
  { key: "2602", PROD_CD: "N0011", PRICE: 40000 },
  { key: "2401", PROD_CD: "N0012", PRICE: 82000 },
  { key: "2123PB", PROD_CD: "N0013", PRICE: 82000 },
  { key: "2123BK", PROD_CD: "N0014", PRICE: 82000 },
  { key: "2123WH", PROD_CD: "N0015", PRICE: 82000 },
  { key: "2118CL", PROD_CD: "N0016", PRICE: 85000 },
  { key: "2118BK", PROD_CD: "N0017", PRICE: 85000 },
  { key: "2020", PROD_CD: "N0018", PRICE: 85000 },
  { key: "2123", PROD_CD: "N0019", PRICE: 85000 }, // ⚠️ 2123PB/BK/WH보다 뒤에 와야 함(더 구체적인 코드 우선 매칭)
  { key: "568PB", PROD_CD: "N0020", PRICE: 95000 },
  { key: "591BK", PROD_CD: "N0021", PRICE: 95000 },
  { key: "674PB", PROD_CD: "N0022", PRICE: 111600 },
  { key: "675BK", PROD_CD: "N0023", PRICE: 111600 },
  { key: "654WH", PROD_CD: "N0024", PRICE: 111600 },
  { key: "658BK", PROD_CD: "N0025", PRICE: 111600 },
  { key: "660WH", PROD_CD: "N0026", PRICE: 111600 },
  { key: "쟈스민R", PROD_CD: "N0029", PRICE: 33000 },
  { key: "폼패드 S", PROD_CD: "N0037", PRICE: 60000 },
  { key: "폼패드 M", PROD_CD: "N0038", PRICE: 60000 },
  { key: "폼패드 L", PROD_CD: "N0039", PRICE: 60000 },
  { key: "36702", PROD_CD: "N0040", PRICE: 60000 },
  { key: "7906", PROD_CD: "O0001", PRICE: 25000 },
  { key: "79300", PROD_CD: "O0002", PRICE: 15000 },
  { key: "7300", PROD_CD: "O0003", PRICE: 15000 },
  { key: "78500", PROD_CD: "O0004", PRICE: 28000 },
  { key: "8531", PROD_CD: "O0005", PRICE: 8400 },
  { key: "7917", PROD_CD: "O0007", PRICE: 8400 },
  { key: "14802", PROD_CD: "O0008", PRICE: 8400 },
  { key: "14602", PROD_CD: "O0009", PRICE: 10560 },
  { key: "14603", PROD_CD: "O0010", PRICE: 8640 },
  { key: "14604", PROD_CD: "O0011", PRICE: 8640 },
  { key: "14803", PROD_CD: "O0012", PRICE: 8640 },
  { key: "14804", PROD_CD: "O0013", PRICE: 8640 },
  { key: "18192", PROD_CD: "O0014", PRICE: 8640 },
  { key: "18182", PROD_CD: "O0015", PRICE: 8640 },
  { key: "18184", PROD_CD: "O0016", PRICE: 8640 },
  { key: "18193", PROD_CD: "O0017", PRICE: 8640 },
  { key: "18194", PROD_CD: "O0018", PRICE: 8640 },
  { key: "7806", PROD_CD: "O0030", PRICE: 8400 },
  { key: "7721", PROD_CD: "O0031", PRICE: 78000 },
  { key: "14904", PROD_CD: "O0032", PRICE: 8400 },
];

const 써지브라_TABLE: Record<string, { PROD_CD: string; PRICE: number }> = {
  S: { PROD_CD: "N0030", PRICE: 33000 },
  M: { PROD_CD: "N0031", PRICE: 33000 },
  L: { PROD_CD: "N0032", PRICE: 33000 },
  XL: { PROD_CD: "N0033", PRICE: 33000 },
  XXL: { PROD_CD: "N0034", PRICE: 33000 },
  XXXL: { PROD_CD: "N0036", PRICE: 33000 },
};

// ✅ "주문 전체"가 매출이 아닌 것으로 봐야 하는 표현 — 상품명 전체 문자열 아무 데나 있으면
//    "/"로 나뉜 다른 하위항목까지 전부 매출 등록 제외(교환/미발송/오배송 건은 거래 자체가 성립 안 함).
const WHOLE_ORDER_EXCLUDE_PATTERNS = [
  "오배송",
  "누락", // 포장누락/발송누락 포함
  "기기교체",
  "기기변경",
  "교체기기",
  "교환", // 교환완/교환발송 포함
  "수거 이후 발송",
  "수거완료되면",
  "추가물품",
  "오수거",
];

// ✅ 그 하위항목 "하나만" 매칭 제외(같은 주문의 다른 하위항목은 정상 매칭).
const PER_ITEM_EXCLUDE_PATTERNS = ["연결고리", "고객물품", "고객반송품"];

function isAmoenaContext(fullText: string): boolean {
  return /아모|아모에나|장루/.test(fullText);
}

// ✅ 수량: 이름 뒤 "-25개", "_1개" 형태. 없으면 기본 1.
function parseQty(text: string): number {
  const m = text.match(/[-_]?\s*(\d+)\s*개/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

function matchSubItem(sub: string): AmoenaSaleLine[] {
  const text = sub.trim();
  if (!text) return [];

  for (const pat of PER_ITEM_EXCLUDE_PATTERNS) {
    if (text.includes(pat)) return [];
  }

  // ✅ "모나" 브랜드는 색상으로 분기(아이보리=568PB, 블랙/검정=591BK). 양쪽 색 동시 언급(각 1개)도 처리.
  if (text.includes("모나")) {
    const hasIvory = text.includes("아이보리");
    const hasBlack = text.includes("검정") || text.includes("블랙");
    const lines: AmoenaSaleLine[] = [];
    if (hasIvory && hasBlack) {
      lines.push({ PROD_CD: "N0020", QTY: 1, PRICE: 95000 });
      lines.push({ PROD_CD: "N0021", QTY: 1, PRICE: 95000 });
      return lines;
    }
    if (hasBlack) return [{ PROD_CD: "N0021", QTY: parseQty(text), PRICE: 95000 }];
    if (hasIvory) return [{ PROD_CD: "N0020", QTY: parseQty(text), PRICE: 95000 }];
    // 색상 불명 -> 매칭 실패(미매핑으로 남겨서 수동 확인)
    return [];
  }

  // ✅ 모델번호 목록과 대조(긴 코드부터 먼저 비교 — 2123PB가 2123보다 먼저 걸리게).
  const sorted = [...PRODUCT_TABLE].sort((a, b) => b.key.length - a.key.length);
  for (const p of sorted) {
    if (text.includes(p.key)) {
      return [{ PROD_CD: p.PROD_CD, QTY: parseQty(text), PRICE: p.PRICE }];
    }
  }

  // ✅ 모델번호 없이 사이즈/형태만 있는 경우(또는 "양쪽형"/"후크형") -> 써지브라로 간주, 기본 M.
  if (/써지브라|양쪽형|후크형|벨크로|\b\d{2}[A-Z]\b/.test(text) || /^[^0-9]*\d+\s*개?$/.test(text) === false) {
    const sizeMatch = text.match(/\b(XXXL|XXL|XL|S|M|L)\b/i);
    const size = sizeMatch ? sizeMatch[1].toUpperCase() : "M";
    const entry = 써지브라_TABLE[size] || 써지브라_TABLE.M;
    // 아모/장루 문맥이 전혀 없는 애매한 텍스트까지 전부 써지브라로 우기지 않도록, 최소한의 신호(아모/장루/써지브라/사이즈+개)가 있을 때만.
    if (isAmoenaContext(text) || /써지브라|양쪽형|후크형/.test(text) || /\b\d{2}[A-Z]\b.*개/.test(text)) {
      return [{ PROD_CD: entry.PROD_CD, QTY: parseQty(text), PRICE: entry.PRICE }];
    }
  }

  return [];
}

/**
 * 롯데 상품명 1건(전체 문자열, "/"로 여러 품목 결합 가능)을 분석해서
 * 아모에나 매출 라인 목록을 돌려준다. 아모에나 관련이 전혀 아니거나 전부 제외 대상이면 빈 배열.
 */
export function matchAmoenaLines(상품명: string): AmoenaSaleLine[] {
  const text = normalizeAmoenaText(상품명);
  if (!text) return [];

  // ✅ 교환/미발송/오배송 등은 주문 전체가 매출이 아니므로, 전체 문자열에서 먼저 확인.
  for (const pat of WHOLE_ORDER_EXCLUDE_PATTERNS) {
    if (text.includes(pat)) return [];
  }

  const subItems = text.split("/").map((s) => s.trim()).filter(Boolean);
  const lines: AmoenaSaleLine[] = [];
  for (const sub of subItems) {
    lines.push(...matchSubItem(sub));
  }
  return lines;
}

function normalizeAmoenaText(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}
