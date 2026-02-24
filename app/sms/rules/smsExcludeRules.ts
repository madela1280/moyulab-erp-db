// app/sms/rules/smsExcludeRules.ts
//
// 문자 집계(05시 aggregate)에서 제외할 통합관리(unified.data) 행을 판정하는 규칙.
// - 서버/클라이언트 어디서든 재사용 가능한 "순수 함수"만 제공한다.
//
// 조리원 계열 제외 규칙(거래처분류 기준):
// 1) 거래처분류 ∈ {
//      조리원, 조리원대여, 조리원락티나, 조리원락티나대여, 조리원심포니, 조리원심포니대여
//    }
//    AND 안내분류가 "안내없음 취급"이면 => 집계 제외
//    안내없음 취급: {해당x(해당X 포함), 안내없음, 빈값(null/undefined/""), 0/"0"}
//
// 2) 위 거래처분류이면서, 안내분류가 안내없음 취급이 "아닌" 경우라도
//    수취인명이 "○○조리원(산후조리원 포함)" 형태(사람 이름이 아닌 조리원명)이면 => 집계 제외

export type SmsExcludeDecision = {
  excluded: boolean;
  reason?: "nursery_partner_and_no_guide" | "nursery_partner_recipient_is_nursery";
};

type UnifiedData = Record<string, any>;

const NURSERY_PARTNERS = new Set([
  "조리원",
  "조리원대여",
  "조리원락티나",
  "조리원락티나대여",
  "조리원심포니",
  "조리원심포니대여",
]);

function normText(v: any): string {
  return String(v ?? "").trim();
}

function normGuide(v: any): string | null {
  // 빈값
  if (v === null || v === undefined) return null;

  // 숫자 0
  if (typeof v === "number") {
    if (v === 0) return "0";
    return normText(v);
  }

  const s = normText(v);
  if (!s) return null;

  // "0" 문자
  if (s === "0") return "0";

  // 해당x / 해당X 같은 입력을 완화 처리(영문자만 소문자화)
  // "해당x", "해당X" → "해당x"
  return s.replace(/X/g, "x");
}

function isGuideExcluded(guide: string | null): boolean {
  if (guide === null) return true; // 빈값 포함
  if (guide === "0") return true;
  if (guide === "해당x") return true;
  if (guide === "안내없음") return true;
  return false;
}

function isNurseryRecipientName(v: any): boolean {
  const s = normText(v);
  if (!s) return false;

  // 요구사항: "00000조리원", "부천더홈산후조리원", "세종시온산후조리원" 등
  // 사람 이름이 아닌 조리원명 형태를 제외 처리
  return s.includes("조리원");
}

export function decideSmsExcludeFromUnifiedRow(data: UnifiedData): SmsExcludeDecision {
  const partner = normText(data?.["거래처분류"]);
  const guide = normGuide(data?.["안내분류"]);

  const isNurseryPartner = NURSERY_PARTNERS.has(partner);

  // 조리원 계열만 본 규칙 적용 (기존 흐름 영향 최소화)
  if (!isNurseryPartner) {
    return { excluded: false };
  }

  // 1) 안내없음 취급이면 제외
  if (isGuideExcluded(guide)) {
    return { excluded: true, reason: "nursery_partner_and_no_guide" };
  }

  // 2) 안내분류가 정상이어도 수취인명이 조리원명(사람 이름 아님)이면 제외
  if (isNurseryRecipientName(data?.["수취인명"])) {
    return { excluded: true, reason: "nursery_partner_recipient_is_nursery" };
  }

  return { excluded: false };
}

/** boolean만 필요한 곳(집계 루프 등)에서 간단히 쓰는 헬퍼 */
export function isSmsExcludedFromUnifiedRow(data: UnifiedData): boolean {
  return decideSmsExcludeFromUnifiedRow(data).excluded;
}