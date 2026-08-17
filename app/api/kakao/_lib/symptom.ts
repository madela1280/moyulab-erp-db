// app/api/kakao/_lib/symptom.ts
//
// 증상 카드 — 내용만. 흐름은 route.ts.
//
// 근거: 모유랩_증상카드_및_대화설계_v1.md 2장(카드 A~K) · 3장(되묻기 트리)
// 현재 구현: A(스윙류 재작동) · B(심포니·락티나 재작동) · C(전원)
//           D~K는 CARDS에 추가하고 resolveCard에 한 줄 넣으면 동작한다.
//
// 설계 원칙 (v4 5장)
//   · 절차는 한 번에 2~3단계씩만. 긴 안내문 금지 → pages[]로 쪼갠다
//   · textCard description 400자 제한. 페이지당 그 안에 들어가야 한다
//   · 버튼은 말풍선당 3개 이하. 선택지는 quickReplies로 낸다

import type { Symptom } from "./slots";

/* ------------------------------------------------------------------ */
/* 1. 기종 → 부품 계열                                                  */
/* ------------------------------------------------------------------ */

export type ModelGroup =
  | "SWING"     // 스윙 / 스윙FLEX / 스윙맥시 / 프리스타일 — 멤브레인형
  | "PRESSURE"  // 심포니 / 락티나 — 압력원형
  | "SIMILE";   // 시밀레 — 메델라 부품 비호환, 카페 링크로 분기

/**
 * unified 제품명 표기가 제각각이다 (스윙 FLEX / 스윙플렉스 / SWING FLEX).
 * 공백·기호 제거 후 부분일치로 잡는다.
 * "-" 나 빈 값이면 null → 상담원 이관 (v4 버그 ⑨)
 */
export function modelGroup(product: unknown): ModelGroup | null {
  const n = String(product ?? "").replace(/[\s\-_()]/g, "").toLowerCase();
  if (!n) return null;

  if (n.includes("시밀레") || n.includes("simile")) return "SIMILE";
  if (n.includes("심포니") || n.includes("symphony")) return "PRESSURE";
  if (n.includes("락티나") || n.includes("lactina")) return "PRESSURE";
  if (n.includes("스윙") || n.includes("swing")) return "SWING";
  if (n.includes("프리스타일") || n.includes("freestyle")) return "SWING";
  return null;
}

/** 퍼스널핏(일반대여) 여부. 보건소는 스탠다드 부품이다 (v4 7-2) */
export function isPersonalFit(product: unknown, dealer: unknown): boolean {
  if (modelGroup(product) !== "PRESSURE") return false;
  return !/보건소/.test(String(dealer ?? ""));
}

/* ------------------------------------------------------------------ */
/* 2. 증상 감지                                                         */
/* ------------------------------------------------------------------ */

/** 되묻기 선택지. extra로 symptom을 실어보내 CLOVA를 건너뛴다 (v4 5장 ③) */
export const SYMPTOM_CHOICES: { label: string; symptom: Symptom; say: string }[] = [
  { label: "압력이 약해요",   symptom: "PRESSURE", say: "압력이 약해요" },
  { label: "전원이 안 켜져요", symptom: "POWER",    say: "전원이 안 켜져요" },
  { label: "소리가 이상해요",  symptom: "NOISE",    say: "소리가 이상해요" },
  { label: "호스에 모유가",   symptom: "REFLUX",   say: "호스에 모유가 들어가요" },
  { label: "화면에 에러가",   symptom: "ERROR",    say: "화면에 에러가 떠요" },
  { label: "아파요",         symptom: "SIZE",     say: "유축할 때 아파요" },
];

/**
 * 좁은 주제를 위에. FAQ 배열과 같은 원칙 (v4 5장).
 * ERROR가 POWER보다 위에 있어야 "에러 뜨고 안 켜져요"가 ERROR로 잡힌다.
 */
const SYMPTOM_KEYWORDS: { symptom: Symptom; re: RegExp }[] = [
  { symptom: "ERROR",    re: /에러|오류|error|경고|느낌표|엑스\s*표시/i },
  { symptom: "REFLUX",   re: /역류|호스에|튜브에|모유가?\s*들어|물이\s*차|김\s*서|습기/ },
  { symptom: "POWER",    re: /전원|안\s*켜|켜지지|꺼져|꺼짐|불이\s*안|작동\s*안\s*(해|되)/ },
  { symptom: "PRESSURE", re: /압력|흡입|안\s*빨|약해|약함|세기|힘이\s*없|안\s*느껴|느껴지지/ },
  { symptom: "NOISE",    re: /소리|소음|시끄|진동|떨림|드르륵|덜컹/ },
  { symptom: "SIZE",     re: /아파|아픔|통증|상처|쓸려|사이즈|깔대기가|깔때기가|안\s*나와|양이\s*줄/ },
];

/** 자유 발화에서 증상 추출. 못 잡으면 null */
export function detectSymptom(utterance: string): Symptom | null {
  for (const { symptom, re } of SYMPTOM_KEYWORDS) {
    if (re.test(utterance)) return symptom;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 3. 증상 + 기종 → 카드                                                */
/* ------------------------------------------------------------------ */

/**
 * ★ 이번 작업의 핵심.
 * 같은 "압력 약함"도 스윙류는 멤브레인 재결합(A),
 * 심포니·락티나는 압력원 딸깍 재결합(B)이다.
 *
 * null = 카드 없음 → 상담원 이관.
 */
export function resolveCard(symptom: Symptom, group: ModelGroup | null): string | null {
  if (group === null) return null;    // 기종 불명 (v4 버그 ⑨)
  if (group === "SIMILE") return null; // 시밀레는 카페 링크 분기 유지

  switch (symptom) {
    case "PRESSURE":
    case "NOISE":
      return group === "SWING" ? "A" : "B";
    case "POWER":
      return "C";
    default:
      return null;                     // D~K 미구현
  }
}

/* ------------------------------------------------------------------ */
/* 4. 카드 본문                                                         */
/* ------------------------------------------------------------------ */

export type CardPage = {
  text: string;
  /** 이 페이지 끝에 물어볼 확인 질문 */
  verify: string;
};

export type Card = {
  id: string;
  title: string;
  pages: CardPage[];
  /** 마지막 페이지까지 했는데도 안 될 때의 판정 문구 */
  unresolved: string;
};

export const CARDS: Record<string, Card> = {
  A: {
    id: "A",
    title: "기기 재작동 (스윙류)",
    pages: [
      {
        text:
          "하얀색 실리콘(멤브레인)을 분리해 주세요.\n" +
          "※ 결합되어 있어도 반드시 분리해야 합니다.\n\n" +
          "그다음 부품 위치에 꾹 눌러 재결합해 주세요.\n" +
          "제대로 밀착되면 아래 부분만 살짝 들떠 있게 됩니다.\n" +
          "결합했는데 쉽게 분리된다면 잘못 결합된 것입니다.",
        verify: "멤브레인을 다시 결합하셨나요?",
      },
      {
        text:
          "단독 콘센트에 전원코드를 연결해 주세요.\n" +
          "(멀티탭은 전압차가 발생할 수 있습니다)\n\n" +
          "깔때기를 가슴에 밀착한 상태로 전원을 켜고,\n" +
          "아래 화살표 버튼으로 유축모드로 전환해 주세요.",
        verify: "노란색 불빛이 들어오나요?",
      },
      {
        text: "유축모드로 전환한 직후\n+ 버튼을 8단계까지 올려주세요.",
        verify: "이제 압력이 느껴지시나요?",
      },
    ],
    unresolved:
      "멤브레인이 손상되었을 수 있습니다.\n" +
      "부품 교체가 필요해 보여서 상담원에게 연결해 드릴게요.",
  },

  B: {
    id: "B",
    title: "기기 재작동 (심포니·락티나)",
    pages: [
      {
        text:
          "기기 전원코드를 분리하고\n" +
          "10~15분 후에 단독 콘센트에 다시 연결해 주세요.",
        verify: "전원코드를 다시 연결하셨나요?",
      },
      {
        text:
          "손잡이 아래 뚜껑을 열고 압력원을 분리해 주세요.\n\n" +
          '압력원 가운데를 꾹 눌러 "딸깍" 소리가 나도록 결합합니다.\n' +
          "한 개씩, 나머지 한 개도 같은 방식으로 해주세요.\n\n" +
          "※ 압력원이 들뜨게 결합되면 압력이 발생하지 않습니다.",
        verify: '"딸깍" 소리가 나도록 결합하셨나요?',
      },
      {
        text:
          "전원을 켜고 LCD에 네모난 바가 나타나면,\n" +
          "통증이 없는 한도에서 레버를 최대 세기로 올려주세요.",
        verify: "이제 압력이 느껴지시나요?",
      },
    ],
    unresolved:
      "기기 자체에 문제가 있을 수 있습니다.\n" +
      "기기 교체 접수를 위해 상담원에게 연결해 드릴게요.",
  },

  C: {
    id: "C",
    title: "전원이 안 켜질 때",
    pages: [
      {
        text:
          "멀티콘센트는 전압차가 있을 수 있습니다.\n" +
          "단독 콘센트에 연결한 후 켜지는지 확인해 주세요.",
        verify: "단독 콘센트에서는 전원이 켜지나요?",
      },
      {
        text:
          "압력원이나 전원코드가 완전히 결합되지 않으면\n" +
          "전원이 작동하지 않습니다.\n" +
          "두 부분을 다시 눌러 결합해 주세요.",
        verify: "재결합 후 전원이 켜지나요?",
      },
    ],
    unresolved: "기기 교체가 필요해 보입니다.\n상담원에게 연결해 드릴게요.",
  },
};

/** 퍼스널핏 전용 추가 안내. 카드 B 2페이지에 덧붙인다 */
export const PERSONALFIT_EXTRA =
  "\n\n(퍼스널핏 부품인 경우)\n" +
  "커넥터를 열고 노란색 역류방지막 둘레를\n" +
  "손으로 누르면서 커넥터를 닫아주세요.";

export function getCard(cardId: string | null): Card | null {
  return cardId ? CARDS[cardId] ?? null : null;
}

export function getPage(cardId: string | null, idx: number): CardPage | null {
  return getCard(cardId)?.pages[idx] ?? null;
}

export function isLastPage(cardId: string | null, idx: number): boolean {
  const card = getCard(cardId);
  return !card || idx >= card.pages.length - 1;
}

/* ------------------------------------------------------------------ */
/* 5. 예·아니오 판정 (VERIFY 단계)                                       */
/* ------------------------------------------------------------------ */

// 부정을 먼저 검사한다. "안 됐어요"에는 "됐"이 들어 있기 때문.
const NO_RE = /아니|안\s*(돼|되|됨|나|켜|들어)|안돼|안되|그대로|똑같|여전|아직도|소용\s*없|못\s*하|모르|ㄴㄴ/;
const YES_RE = /네|넹|예|응|어|맞아|맞습|했어|했습|됐|된다|되네|되요|돼요|해결|느껴|켜져|나와|ㅇㅇ|ok|오케|굿/i;

export function detectYesNo(utterance: string): "YES" | "NO" | null {
  const t = utterance.trim();
  if (!t) return null;
  if (NO_RE.test(t)) return "NO";
  if (YES_RE.test(t)) return "YES";
  return null;
}
