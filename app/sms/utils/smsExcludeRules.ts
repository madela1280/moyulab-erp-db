// app/sms/rules/smsExcludeRules.ts
//
// 문자 집계(05시 aggregate)에서 제외할 통합관리(unified.data) 행을 판정하는 규칙.
// - 서버/클라이언트 어디서든 재사용 가능한 "순수 함수"만 제공한다.
// - 예외 조건(요구사항):
//   거래처분류 ∈ {조리원, 조리원대여, 조리원심포니, 조리원심포니대여}
//   AND 안내분류 ∈ {해당x, 안내없음, 빈값(null/undefined/""), 0/"0"}
//   => 문자 집계 대상에서 제외
//
// 주의:
// - 조리원락티나, 조리원락티나대여 는 "조리원 계열"이지만 제외 대상이 아님.

export type SmsExcludeDecision = {
  excluded: boolean;
  reason?: "nursery_partner_and_no_guide";
};

type UnifiedData = Record<string, any>;

const EXCLUDED_PARTNERS = new Set([
  "조리원",
  "조리원대여",
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

export function decideSmsExcludeFromUnifiedRow(data: UnifiedData): SmsExcludeDecision {
  const partner = normText(data?.["거래처분류"]);
  const guide = normGuide(data?.["안내분류"]);

  const partnerExcluded = EXCLUDED_PARTNERS.has(partner);
  const guideExcluded = isGuideExcluded(guide);

  if (partnerExcluded && guideExcluded) {
    return { excluded: true, reason: "nursery_partner_and_no_guide" };
  }

  return { excluded: false };
}

/** boolean만 필요한 곳(집계 루프 등)에서 간단히 쓰는 헬퍼 */
export function isSmsExcludedFromUnifiedRow(data: UnifiedData): boolean {
  return decideSmsExcludeFromUnifiedRow(data).excluded;
}