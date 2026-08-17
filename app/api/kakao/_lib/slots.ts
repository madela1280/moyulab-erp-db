// app/api/kakao/_lib/slots.ts
//
// 대화 슬롯 — 세션에 "어디까지 진행했는지"를 들고 있게 하는 계층
//
// 인수인계 v4 9장 ①번 / 버그 ①(증상 슬롯 없음) 해결.
// DB는 건드리지 않는다. session.ts가 읽어온 객체를 받아 순수 함수로
// 가공해 돌려주기만 한다. 저장 위치는 slots->'__dialog'.

export type Stage =
  | "IDENTIFY"    // 본인확인 완료, 무엇을 도울지 미정
  | "ASK_SYMPTOM" // "어떤 증상인가요?" 되묻는 중
  | "GUIDE"       // 카드 절차 안내 중
  | "VERIFY"      // "해결되셨나요?" 답을 기다리는 중
  | "ESCALATED";  // 상담원 전환됨

export type Symptom =
  | "POWER"     // 전원 안 켜짐
  | "PRESSURE"  // 압력 약함 / 안 빨림
  | "NOISE"     // 소리 이상
  | "REFLUX"    // 호스 역류
  | "ERROR"     // 시스템 에러
  | "SIZE";     // 아픔 / 깔때기 사이즈

export type EscalateReason =
  | "BUTTON"      // 고객이 직접 요청
  | "RISK"        // 위험 질문 — SENS 알림 대상
  | "UNRESOLVED"  // 자가해결 실패
  | "NO_MATCH"    // 의도·증상 분류 실패
  | "AUTH_FAIL"   // 본인확인 실패
  | "NO_CARD";    // 기종 불명 또는 카드 미구현 (v4 버그 ⑨)

export type Dialog = {
  stage: Stage;
  symptom: Symptom | null;
  /** 증상 카드 A~K */
  cardId: string | null;
  /** 카드 내 절차 페이지 (0부터) */
  stepIdx: number;
  /** 되묻기 재시도 횟수. MAX_ATTEMPTS 초과 시 이관 */
  attempts: number;
  /** 안내한 "카드:페이지" 목록. 이관 요약의 원천 */
  guided: string[];
  reason: EscalateReason | null;
};

/** 되묻기 3회 초과 시 이관 */
export const MAX_ATTEMPTS = 3;

/** slots 안에서 대화 슬롯이 사는 키 */
export const DIALOG_KEY = "__dialog";

export const EMPTY_DIALOG: Dialog = {
  stage: "IDENTIFY",
  symptom: null,
  cardId: null,
  stepIdx: 0,
  attempts: 0,
  guided: [],
  reason: null,
};

const STAGES: Stage[] = ["IDENTIFY", "ASK_SYMPTOM", "GUIDE", "VERIFY", "ESCALATED"];
const SYMPTOMS: Symptom[] = ["POWER", "PRESSURE", "NOISE", "REFLUX", "ERROR", "SIZE"];
const REASONS: EscalateReason[] = [
  "BUTTON", "RISK", "UNRESOLVED", "NO_MATCH", "AUTH_FAIL", "NO_CARD",
];

/**
 * 무엇이 들어와도 절대 throw 하지 않는다.
 * 슬롯 파싱 실패로 챗봇이 폴백 문구를 내는 사고를 막기 위함.
 */
export function parseDialog(raw: unknown): Dialog {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_DIALOG };
  const o = raw as Record<string, unknown>;

  const idx = Number(o.stepIdx);
  const att = Number(o.attempts);

  return {
    stage: STAGES.includes(o.stage as Stage) ? (o.stage as Stage) : "IDENTIFY",
    symptom: SYMPTOMS.includes(o.symptom as Symptom) ? (o.symptom as Symptom) : null,
    cardId: typeof o.cardId === "string" && o.cardId ? o.cardId : null,
    stepIdx: Number.isFinite(idx) && idx >= 0 ? Math.floor(idx) : 0,
    attempts: Number.isFinite(att) && att >= 0 ? Math.floor(att) : 0,
    guided: Array.isArray(o.guided)
      ? o.guided.filter((x): x is string => typeof x === "string").slice(-30)
      : [],
    reason: REASONS.includes(o.reason as EscalateReason) ? (o.reason as EscalateReason) : null,
  };
}

/* ------------------------------------------------------------------ */
/* 상태 전이 — 항상 새 객체를 돌려준다                                   */
/* ------------------------------------------------------------------ */

export function askSymptom(d: Dialog): Dialog {
  return { ...d, stage: "ASK_SYMPTOM", symptom: null, cardId: null, stepIdx: 0 };
}

/** 증상 확정 → 카드 진입. attempts·stepIdx 리셋 */
export function enterCard(d: Dialog, symptom: Symptom, cardId: string): Dialog {
  return {
    ...d,
    stage: "GUIDE",
    symptom,
    cardId,
    stepIdx: 0,
    attempts: 0,
    guided: pushGuided(d.guided, `${cardId}:0`),
  };
}

/** 카드 다음 페이지로 */
export function nextStep(d: Dialog): Dialog {
  const idx = d.stepIdx + 1;
  return {
    ...d,
    stage: "GUIDE",
    stepIdx: idx,
    guided: pushGuided(d.guided, `${d.cardId ?? "?"}:${idx}`),
  };
}

/** 절차를 보여준 직후 — 답을 기다리는 상태로 */
export function waitVerify(d: Dialog): Dialog {
  return { ...d, stage: "VERIFY" };
}

export function bumpAttempts(d: Dialog): Dialog {
  return { ...d, attempts: d.attempts + 1 };
}

export function attemptsExceeded(d: Dialog): boolean {
  return d.attempts >= MAX_ATTEMPTS;
}

export function escalate(d: Dialog, reason: EscalateReason): Dialog {
  return { ...d, stage: "ESCALATED", reason };
}

export function isEscalated(d: Dialog): boolean {
  return d.stage === "ESCALATED";
}

export function inDialog(d: Dialog): boolean {
  return d.stage === "ASK_SYMPTOM" || d.stage === "GUIDE" || d.stage === "VERIFY";
}

/**
 * 기기문제 대화만 초기화. 인증 결과(unifiedId)는 session 쪽이라 무관.
 * guided는 남긴다 — 한 세션에서 뭘 안내했는지가 이관 요약에 필요.
 */
export function resetDialog(d: Dialog): Dialog {
  return {
    ...d,
    stage: "IDENTIFY",
    symptom: null,
    cardId: null,
    stepIdx: 0,
    attempts: 0,
    reason: null,
  };
}

function pushGuided(guided: string[], entry: string): string[] {
  if (guided[guided.length - 1] === entry) return guided;
  return [...guided, entry].slice(-30);
}

/**
 * 이관 시 상담원에게 넘길 요약 (v4 버그 ⑤ A안).
 * "카드A 3단계까지 안내" 형태.
 */
export function guidedSummary(d: Dialog): string {
  if (d.guided.length === 0) return "봇 안내 내역 없음";

  const maxStep = new Map<string, number>();
  for (const g of d.guided) {
    const [card, step] = g.split(":");
    if (!card) continue;
    const n = Number(step);
    maxStep.set(card, Math.max(maxStep.get(card) ?? 0, Number.isFinite(n) ? n : 0));
  }

  return [...maxStep.entries()]
    .map(([card, step]) => `카드${card} ${step + 1}단계까지 안내`)
    .join(" / ");
}
