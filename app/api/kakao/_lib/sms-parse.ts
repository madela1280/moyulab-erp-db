// app/api/kakao/_lib/sms-parse.ts
//
// 은행 입금 문자 파서 — 순수 함수 (DB 접근 없음)
//
// ⚠️ 은행 문자 형식은 은행·상품마다 다릅니다. 아래 패턴은 국민은행 계열의
//    일반적인 형식 기준이며, 실제 입금 문자 샘플 2~3개를 받으면
//    PATTERNS 배열에 한 줄씩 추가·조정해야 최종 확정됩니다.
//    파싱 실패 문자는 버리지 않고 sms_inbound에 원문 보관 → 수동 처리.

export type ParsedSms = {
  ok: boolean;
  /** 입금 금액 (원) */
  amount: number | null;
  /** 입금자명 */
  depositor: string | null;
  /** 출금(이체 나감) 문자 등 대상 아님 */
  ignored: boolean;
  reason?: string;
};

// 은행·보안 문구 등 이름으로 오인하면 안 되는 토큰
const NOT_NAMES = new Set([
  "국민", "국민은행", "KB", "kb", "입금", "출금", "잔액", "전자금융",
  "체크카드", "타행", "당행", "누적", "지급", "이체", "web", "Web",
]);

/**
 * 파싱 시도. 실패해도 throw 하지 않는다.
 */
export function parseDepositSms(raw: string): ParsedSms {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, amount: null, depositor: null, ignored: true, reason: "빈 문자" };

  // 출금·이체·결제 문자는 대상 아님
  if (/출금|체크카드|승인|결제/.test(text) && !/입금/.test(text)) {
    return { ok: false, amount: null, depositor: null, ignored: true, reason: "입금 아님" };
  }
  if (!/입금/.test(text)) {
    return { ok: false, amount: null, depositor: null, ignored: true, reason: "입금 아님" };
  }

  // 금액: "입금" 주변의 숫자(,포함)+원 — 잔액 금액과 혼동하지 않도록 입금 근처 우선
  const amount = extractAmount(text);
  if (amount === null) {
    return { ok: false, amount: null, depositor: null, ignored: false, reason: "금액 추출 실패" };
  }

  const depositor = extractName(text);
  if (!depositor) {
    return { ok: false, amount, depositor: null, ignored: false, reason: "입금자명 추출 실패" };
  }

  return { ok: true, amount, depositor, ignored: false };
}

function extractAmount(text: string): number | null {
  // 1순위: "입금 35,000원" / "입금35000원"
  let m = text.match(/입금[^0-9]{0,10}([0-9][0-9,]*)\s*원/);
  // 2순위: "35,000원 입금"
  if (!m) m = text.match(/([0-9][0-9,]*)\s*원[^가-힣]{0,4}입금/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractName(text: string): string | null {
  // "입금" 앞뒤로 등장하는 한글 2~4자 토큰 중 은행 문구가 아닌 것
  // 예: "김민지 입금 35,000원" / "입금 35,000원 김민지"
  const tokens = text.match(/[가-힣]{2,4}/g) ?? [];
  const idx = text.indexOf("입금");

  // 입금 위치에서 가까운 순으로 정렬해 첫 유효 토큰 선택
  const scored = tokens
    .filter((t) => !NOT_NAMES.has(t))
    .map((t) => ({ t, d: Math.abs(text.indexOf(t) - idx) }))
    .sort((a, b) => a.d - b.d);

  const name = scored[0]?.t ?? null;
  // "홍길동님" → "홍길동" (payment_orders.depositor_name 과 매칭되도록)
  return name ? name.replace(/님$/, "") : null;
}

/* ------------------------------------------------------------------ */
/* 자체 테스트: node --experimental-strip-types sms-parse.ts 또는       */
/* ts-node 로 직접 실행 시 케이스 검증                                   */
/* ------------------------------------------------------------------ */

export const SAMPLE_CASES: { raw: string; amount: number | null; depositor: string | null }[] = [
  { raw: "[KB]08/20 14:32 272501**286073 김민지 입금 35,000원 잔액2,111,000원", amount: 35000, depositor: "김민지" },
  { raw: "KB국민은행 입금 20,000원 박서준 08/21 09:15 잔액 555,000원", amount: 20000, depositor: "박서준" },
  { raw: "[Web발신] 국민 08/21 이수현 입금 12,000 원", amount: 12000, depositor: "이수현" },
  { raw: "[KB] 체크카드 승인 35,000원 스타벅스", amount: null, depositor: null },
];
