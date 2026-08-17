// app/api/kakao/fallback/route.ts
//
// [블록] 폴백 블록 — 챗봇의 정문
//
// 스킬 URL: https://moulab.kr/api/kakao/fallback
//
// 처리 순서
//   ⓪ 리스트카드 선택
//   ① 발화에 전화번호가 있으면 → 인증
//   ② 인증 안 된 상태 → 인사말 + 번호 요청
//   ③ 위험 질문(의료·사고) → 즉시 상담원
//   ④ 증상 선택지 클릭(clientExtra) → CLOVA 건너뛰고 바로 카드
//   ⑤ 진행 중인 대화 처리 — VERIFY(예/아니오) · ASK_SYMPTOM(증상 답)
//   ⑥ 정보 불일치 감지 → 상담원
//   ⑦ 의도 판단: 키워드 우선 → 못 잡으면 CLOVA → 그래도 모르면 직전 의도로 재해석
//   ⑧ 의도별 안내 (TROUBLE 은 되묻기 트리로)

import { NextRequest } from "next/server";
import {
  extractPhone, getClientExtra, getUserKey, getUtterance,
  itemCard, listCard, maskAddress, maskName, maskPhone,
  operatorButton, simpleText, textCard, type QuickReply,
} from "@/api/kakao/_lib/kakao";
import { getSession, setSession, sweepExpired } from "@/api/kakao/_lib/session";
import {
  findById, findByPhone, overdueFee, statusLabel, text, ymd, type Rental,
} from "@/api/kakao/_lib/rental";
import {
  agentHoursNote, checkRisk, escalateMessage, findFaq, FAQ_MENU,
  isSimile, LINKS, medicalMessage, SIMILE_LINKS,
} from "@/api/kakao/_lib/faq";
import { classifyIntent, type ClovaIntent } from "@/api/kakao/_lib/clova";
import {
  askSymptom, attemptsExceeded, bumpAttempts, enterCard, escalate, guidedSummary,
  inDialog, isEscalated, nextStep, resetDialog, waitVerify,
  type Dialog, type EscalateReason, type Symptom,
} from "@/api/kakao/_lib/slots";
import {
  detectSymptom, detectYesNo, getCard, getPage, isLastPage, isPersonalFit,
  modelGroup, PERSONALFIT_EXTRA, resolveCard, SYMPTOM_CHOICES,
} from "@/api/kakao/_lib/symptom";

export const dynamic = "force-dynamic";

type Intent = ClovaIntent;

const GREETING =
  "안녕하세요, 모유랩입니다 🍼\n\n" +
  "반납, 연장, 사용법은 물론이고\n" +
  "유축이 잘 안 되거나 물품이 잘못 왔을 때도\n" +
  "편하게 말씀해 주세요.\n\n" +
  "먼저 본인 확인이 필요합니다.\n" +
  "대여하실 때 등록하신 휴대폰 번호를 알려주세요.\n\n" +
  "예) 010-1234-5678";

const NOT_FOUND =
  "입력하신 번호로 대여 정보를 찾지 못했어요.\n\n" +
  "· 번호를 다시 확인해 주세요\n" +
  "· 다른 분 명의로 신청하셨다면 그 번호로 알려주세요\n\n" +
  "계속 안 되시면 상담원을 연결해 드릴게요.";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userKey = getUserKey(body);
    const utterance = getUtterance(body);
    const extra = getClientExtra(body);

    void sweepExpired();

    // ⓪ 리스트카드에서 특정 대여건을 고른 경우
    const pickedId = Number(extra?.unifiedId);
    if (Number.isFinite(pickedId) && pickedId > 0) {
      const picked = await findById(pickedId);
      if (picked) {
        await setSession(userKey, { unifiedId: picked.id, intent: "LOOKUP" });
        return renderRental(picked);
      }
    }

    // ① 전화번호 인증
    const phone = extractPhone(body);
    if (phone) return await authenticate(userKey, phone);

    // ② 인증 상태 확인
    const session = await getSession(userKey);
    if (!session.unifiedId) return simpleText(GREETING);

    const rental = await findById(session.unifiedId);
    if (!rental) return simpleText(GREETING);

    const prevIntent = session.intent ?? "";

    // 이관 상태에서 발화가 들어왔다 = 고객이 [상담 종료]를 눌러 봇으로 돌아왔다.
    // 대화를 초기화하고 평소처럼 응대한다.
    let dialog: Dialog = isEscalated(session.dialog)
      ? resetDialog(session.dialog)
      : session.dialog;

    // ③ 위험 질문은 답변을 시도하지 않고 바로 상담원
    const risk = checkRisk(utterance);
    if (risk === "medical") {
      return await toAgent(userKey, dialog, "RISK", {
        title: "상담원이 확인해 드릴게요",
        description: medicalMessage(),
      });
    }
    if (risk === "escalate") {
      return await toAgent(userKey, dialog, "RISK", {
        title: "상담원을 연결해 드릴게요",
        description: escalateMessage(),
      });
    }

    // ④ 증상 선택지 클릭 — CLOVA 건너뛰고 바로 카드 (약 0.6초 절약)
    const clicked = pickSymptom(extra?.symptom);
    if (clicked) {
      return await startCard(userKey, dialog, rental, clicked);
    }

    // ⑤ 진행 중인 대화 먼저 처리
    if (inDialog(dialog)) {
      const handled = await continueDialog(userKey, dialog, rental, utterance);
      if (handled) return handled;
      // 다른 화제로 넘어간 경우 — 대화를 접고 통상 흐름으로
      dialog = resetDialog(dialog);
    }

    // ⑥ 조회된 정보와 다른 기종을 말하는 경우 → 상담원
    if (detectWrongInfo(utterance, rental)) {
      await setSession(userKey, { intent: "WRONG_INFO", dialog });
      return renderWrongInfo(rental);
    }

    // ⑦ 키워드 우선, 못 잡으면 CLOVA, 그래도 모르면 직전 의도로 재해석
    let intent = detectByKeyword(utterance);

    if (intent === "UNKNOWN" && utterance.length > 0) {
      const r = await classifyIntent(utterance);
      console.log("[CLOVA]", JSON.stringify({ q: utterance.slice(0, 40), ...r }));
      if (r.ok && r.confidence >= 0.5) intent = r.intent;
    }

    if (intent === "UNKNOWN") {
      const carried = carryOverIntent(utterance, prevIntent);
      if (carried) {
        console.log("[CARRY]", JSON.stringify({ q: utterance.slice(0, 40), prevIntent }));
        intent = carried;
      }
    }

    if (intent === "WRONG_INFO") {
      await setSession(userKey, { intent, dialog });
      return renderWrongInfo(rental);
    }

    // "그래도 안 돼요" — 카드 밖 경로에서 들어온 경우
    if (intent === "UNRESOLVED") {
      return await toAgent(userKey, dialog, "UNRESOLVED", {
        title: "상담원이 도와드릴게요",
        description: unresolvedText(dialog),
      });
    }

    // ⑧ 기기문제는 되묻기 트리로
    if (intent === "TROUBLE") {
      return await handleTrouble(userKey, dialog, rental, utterance);
    }

    await setSession(userKey, { intent, dialog });
    return respond(intent, rental, utterance);
  } catch (e) {
    console.error("[KAKAO_FALLBACK]", e);
    return simpleText(
      "일시적인 문제가 생겼어요. 잠시 후 다시 시도해 주세요.\n계속 안 되면 상담원을 연결해 드릴게요."
    );
  }
}

export async function GET() {
  return Response.json({ ok: true, block: "폴백 블록" });
}

/* ------------------------------------------------------------------ */
/* 인증                                                                */
/* ------------------------------------------------------------------ */

async function authenticate(userKey: string, phone: string) {
  const rows = await findByPhone(phone);

  if (rows.length === 0) {
    return simpleText(NOT_FOUND, {
      quickReplies: [
        { label: "다른 번호로", action: "message", messageText: "다른 번호로 조회할게요" },
        { label: "상담원 연결", action: "message", messageText: "상담원 연결해주세요" },
      ],
    });
  }

  const phoneTail = phone.slice(-4);

  if (rows.length > 1) {
    await setSession(userKey, { phoneTail, intent: "LOOKUP" });
    return listCard({
      headerTitle: `대여 내역이 ${rows.length}건 있어요. 어느 건인가요?`,
      items: rows.map((r) => ({
        title: `${text(r.data["제품"])} · ${statusLabel(r)}`,
        description: `${ymd(r.data["시작일"])} ~ ${ymd(r.data["종료일"])}`,
        action: "message" as const,
        messageText: `${text(r.data["제품"])} 대여건이요`,
        extra: { unifiedId: r.id },
      })),
    });
  }

  const rental = rows[0];
  await setSession(userKey, { unifiedId: rental.id, phoneTail, intent: "LOOKUP" });
  return renderRental(rental);
}

/* ------------------------------------------------------------------ */
/* 되묻기 트리 — 기기문제                                                */
/* ------------------------------------------------------------------ */

/** 선택지 클릭으로 넘어온 증상값을 검증한다 */
function pickSymptom(v: unknown): Symptom | null {
  const s = String(v ?? "");
  const hit = SYMPTOM_CHOICES.find((c) => c.symptom === s);
  return hit ? hit.symptom : null;
}

/**
 * TROUBLE 진입.
 * 발화에 증상이 이미 있으면 되묻지 않고 바로 카드로 간다.
 *   "기기에 문제가 있어" → 증상 없음 → 되묻기
 *   "압력이 안 느껴져"   → PRESSURE  → 카드 A 또는 B
 * 이 두 줄이 v4 버그 ① 의 해결점이다.
 */
async function handleTrouble(userKey: string, dialog: Dialog, r: Rental, utterance: string) {
  // 시밀레는 자체 자료로 분기 (기존 동작 유지)
  if (isSimile(String(r.data["제품"] ?? ""))) {
    await setSession(userKey, { intent: "TROUBLE", dialog: resetDialog(dialog) });
    return textCard({
      title: "시밀레 문제 해결",
      description:
        "시밀레는 아래 자료에서 대처법을 확인하실 수 있어요.\n\n" +
        "해결이 안 되면 상담원을 연결해 드릴게요.",
      buttons: [
        { label: "문제 대처법", action: "webLink", webLinkUrl: SIMILE_LINKS.trouble },
        { label: "설명서", action: "webLink", webLinkUrl: SIMILE_LINKS.manual },
        operatorButton(),
      ],
    });
  }

  const symptom = detectSymptom(utterance);
  if (symptom) return await startCard(userKey, dialog, r, symptom);

  // 증상 카드가 없는 주제(세척·소독·모드 등)는 기존 FAQ 로
  const faq = findFaq(utterance);
  if (faq) {
    await setSession(userKey, { intent: "TROUBLE", dialog: resetDialog(dialog) });
    return textCard(
      {
        title: faq.title,
        description: faq.body,
        buttons: [operatorButton()],
      },
      { quickReplies: [...symptomQuick(), UNRESOLVED_QUICK] }
    );
  }

  // 증상을 되묻는다
  await setSession(userKey, { intent: "TROUBLE", dialog: askSymptom(dialog) });
  return simpleText(
    "어떤 증상인지 알려주시면 기종에 맞는 방법을 안내해 드릴게요.\n\n" +
      "아래에서 골라주시거나, 직접 말씀해 주셔도 됩니다.",
    { quickReplies: symptomQuick() }
  );
}

/** 증상 확정 → 카드 진입 → 첫 페이지 출력 */
async function startCard(userKey: string, dialog: Dialog, r: Rental, symptom: Symptom) {
  const group = modelGroup(r.data["제품"]);
  const cardId = resolveCard(symptom, group);

  if (!cardId) {
    // 기종 불명(v4 버그 ⑨) · 시밀레 · 미구현 카드
    const why =
      group === null
        ? "대여 기종이 확인되지 않아 정확한 안내가 어려워요."
        : "이 증상은 기기 상태를 직접 확인해야 할 것 같아요.";
    return await toAgent(userKey, dialog, "NO_CARD", {
      title: "상담원이 확인해 드릴게요",
      description: `${why}\n\n상담원이 바로 도와드릴게요.` + agentHoursNote(),
    });
  }

  return await showPage(userKey, enterCard(dialog, symptom, cardId), r);
}

/** 카드의 현재 페이지를 출력하고 VERIFY 로 넘어간다 */
async function showPage(userKey: string, dialog: Dialog, r: Rental) {
  const card = getCard(dialog.cardId);
  const page = getPage(dialog.cardId, dialog.stepIdx);

  if (!card || !page) {
    return await toAgent(userKey, dialog, "NO_CARD", {
      title: "상담원이 도와드릴게요",
      description: "안내를 이어가기 어려워 상담원을 연결해 드릴게요." + agentHoursNote(),
    });
  }

  let bodyText = page.text;
  if (
    dialog.cardId === "B" &&
    dialog.stepIdx === 1 &&
    isPersonalFit(r.data["제품"], r.data["거래처분류"])
  ) {
    bodyText += PERSONALFIT_EXTRA;
  }

  const total = card.pages.length;
  const title = `${card.title} (${dialog.stepIdx + 1}/${total})`;

  await setSession(userKey, { intent: "TROUBLE", dialog: waitVerify(dialog) });

  return textCard(
    {
      title,
      description: `${bodyText}\n\n▶ ${page.verify}`,
      buttons: [operatorButton()],
    },
    {
      quickReplies: [
        { label: "네, 됐어요", action: "message", messageText: "네 됐어요" },
        { label: "아니요, 안 돼요", action: "message", messageText: "아니요 안 돼요" },
      ],
    }
  );
}

/**
 * 진행 중인 대화를 이어받는다.
 * 응답을 만들면 그것을 돌려주고, 화제가 바뀌었으면 null 을 돌려준다.
 */
async function continueDialog(
  userKey: string,
  dialog: Dialog,
  r: Rental,
  utterance: string
): Promise<Response | null> {
  // 증상 되묻기에 대한 답
  if (dialog.stage === "ASK_SYMPTOM") {
    const symptom = detectSymptom(utterance);
    if (symptom) return await startCard(userKey, dialog, r, symptom);

    // 명확히 다른 의도면 대화를 접는다
    if (detectByKeyword(utterance) !== "UNKNOWN") return null;

    const bumped = bumpAttempts(dialog);
    if (attemptsExceeded(bumped)) {
      return await toAgent(userKey, bumped, "NO_MATCH", {
        title: "상담원이 도와드릴게요",
        description:
          "증상을 정확히 파악하지 못했어요.\n" +
          "상담원이 직접 확인하고 안내해 드릴게요." +
          agentHoursNote(),
      });
    }

    await setSession(userKey, { intent: "TROUBLE", dialog: bumped });
    return simpleText(
      "죄송해요, 조금 더 구체적으로 알려주실 수 있을까요?\n\n" +
        "아래에서 가장 가까운 것을 골라주셔도 됩니다.",
      { quickReplies: symptomQuick() }
    );
  }

  // 절차 안내 후 결과 확인
  if (dialog.stage === "VERIFY") {
    const yn = detectYesNo(utterance);

    if (yn === "YES") {
      // 마지막 페이지에서 해결 → 종결. 중간이면 다음 단계로
      if (isLastPage(dialog.cardId, dialog.stepIdx)) {
        await setSession(userKey, { intent: "TROUBLE", dialog: resetDialog(dialog) });
        return simpleText(
          "다행이에요! 잘 해결되어 기쁩니다 🙂\n\n" +
            "사용하시면서 또 궁금한 점이 있으면 편하게 말씀해 주세요.",
          { quickReplies: quickFor(r) }
        );
      }
      return await showPage(userKey, nextStep(dialog), r);
    }

    if (yn === "NO") {
      // 아직 남은 절차가 있으면 계속, 마지막이면 판정 후 이관
      if (!isLastPage(dialog.cardId, dialog.stepIdx)) {
        return await showPage(userKey, nextStep(dialog), r);
      }
      const card = getCard(dialog.cardId);
      return await toAgent(userKey, dialog, "UNRESOLVED", {
        title: "상담원이 도와드릴게요",
        description:
          (card?.unresolved ?? "상담원이 확인해 드릴게요.") + agentHoursNote(),
      });
    }

    // 예·아니오가 아닌 답
    if (detectByKeyword(utterance) !== "UNKNOWN") return null;

    const bumped = bumpAttempts(dialog);
    if (attemptsExceeded(bumped)) {
      return await toAgent(userKey, bumped, "UNRESOLVED", {
        title: "상담원이 도와드릴게요",
        description: unresolvedText(bumped) + agentHoursNote(),
      });
    }

    const page = getPage(dialog.cardId, dialog.stepIdx);
    await setSession(userKey, { intent: "TROUBLE", dialog: bumped });
    return simpleText(`${page?.verify ?? "해결되셨나요?"}\n\n네 / 아니요 로 알려주세요.`, {
      quickReplies: [
        { label: "네, 됐어요", action: "message", messageText: "네 됐어요" },
        { label: "아니요, 안 돼요", action: "message", messageText: "아니요 안 돼요" },
        { label: "상담원 연결", action: "message", messageText: "상담원 연결해주세요" },
      ],
    });
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* 상담원 이관                                                          */
/* ------------------------------------------------------------------ */

/**
 * 이관 처리. 세션에 사유와 안내 내역을 남긴다.
 * ⚠️ 고객이 하단 [상담 종료]를 누르지 않으면 봇으로 돌아오지 않는다.
 *    따라서 자동 이관은 최소화하고, 버튼 제시로 고객이 고르게 한다.
 */
async function toAgent(
  userKey: string,
  dialog: Dialog,
  reason: EscalateReason,
  card: { title: string; description: string }
) {
  const next = escalate(dialog, reason);
  await setSession(userKey, { intent: "AGENT", dialog: next });

  console.log(
    "[ESCALATE]",
    JSON.stringify({ reason, summary: guidedSummary(next), symptom: next.symptom })
  );

  return textCard({
    title: card.title,
    description: card.description,
    buttons: [operatorButton()],
  });
}

function unresolvedText(dialog: Dialog): string {
  const done = dialog.guided.length > 0 ? `\n\n(${guidedSummary(dialog)})` : "";
  return (
    "안내드린 방법으로도 해결되지 않으셨군요.\n" +
    "기기 상태를 직접 확인해야 할 것 같습니다.\n\n" +
    "부품 교체나 기기 교환이 필요할 수 있어\n" +
    "상담원이 확인 후 안내해 드릴게요." +
    done
  );
}

/* ------------------------------------------------------------------ */
/* 정보 불일치 감지                                                     */
/* ------------------------------------------------------------------ */

// 각시밀은 사용 중단된 기종이라 목록에서 제외 (2026-08 대표 확인)
const MODELS = ["심포니", "락티나", "스윙맥시", "스윙", "프리스타일", "시밀레"];

/** 긴 이름부터 검사해야 스윙맥시가 스윙에 먹히지 않는다 */
function mentionedModel(utterance: string): string | null {
  for (const m of MODELS) {
    if (utterance.includes(m)) return m;
  }
  return null;
}

function detectWrongInfo(utterance: string, r: Rental): boolean {
  // 변경 의사가 명확하면 CHANGE 로 넘긴다
  if (/변경|바꾸|바꿔|교체/.test(utterance)) return false;

  // 명시적 정정
  if (
    /정보가?\s*(틀|다르|잘못|안\s*맞)|잘못\s*(나와|나온|되어|됐|표시)|내\s*게\s*아니|제\s*게\s*아니/.test(
      utterance
    )
  ) {
    return true;
  }

  // 다른 기종 + 소유·대여 표현
  const said = mentionedModel(utterance);
  if (!said) return false;

  const mine = String(r.data["제품"] ?? "").trim();
  if (!mine || mine === "-") return false;
  if (mine.includes(said)) return false;
  if (isSimile(said) && isSimile(mine)) return false;

  return /빌렸|빌린|대여했|대여한|쓰고\s*있|사용\s*중|받았|인데|아닌데|아니라/.test(utterance);
}

function renderWrongInfo(r: Rental) {
  return textCard({
    title: "정보를 다시 확인해 드릴게요",
    description:
      `조회된 내용은 ${text(r.data["제품"])} · ${text(r.data["거래처분류"])} 입니다.\n\n` +
      "말씀하신 내용과 다르다면\n" +
      "· 다른 번호로 접수되었거나\n" +
      "· 여러 건 중 다른 건일 수 있어요\n\n" +
      "상담원이 정확히 확인해 드릴게요." +
      agentHoursNote(),
    buttons: [
      { label: "다른 번호로 조회", action: "message", messageText: "다른 번호로 조회할게요" },
      operatorButton(),
    ],
  });
}

/* ------------------------------------------------------------------ */
/* 의도 판단 — 키워드 (빠른 경로)                                        */
/* ------------------------------------------------------------------ */

const RULES: [Intent, RegExp][] = [
  ["GREET", /^(안녕|하이|헬로|여보세요|안뇽)/],
  ["OPEN", /다른\s*(걸|것|거|문의|질문)|물어보고\s*싶|궁금한\s*(게|것)/],
  ["AGENT", /상담원|직원|통화|전화\s*(주|해)/],
  ["OVERDUE", /연체|늦었|지났|기간\s*넘/],
  ["RETURN", /반납|회수|수거|가져가|돌려|그만\s*(쓰|사용)|다\s*썼/],
  ["EXTEND", /연장|더\s*쓰|더쓰|늘리|기간\s*추가/],
  ["PARTS", /부품.*(구매|사고|주문|추가)|깔대기.*(구매|사고|주문)|깔때기.*(구매|사고|주문)|포장재.*(구매|사고|주문)|더\s*사고/],
  // CHANGE 는 변경 의사가 분명할 때만 (정보 정정과 구분)
  ["CHANGE", /기종\s*변경|기기\s*(변경|바꾸|바꿔)|다른\s*(기기|기종).*(변경|바꾸|바꿔|교체)|교체해\s*(주|줄)/],
  ["MANUAL", /설명서|매뉴얼|사용\s*안내서/],
  ["DELIVERY", /배송|택배|송장|언제\s*와|도착|발송/],
  ["LOOKUP", /내\s*정보|대여\s*정보|만기|언제까지|남은\s*기간|조회|확인/],
  ["TROUBLE", /사용법|어떻게\s*(써|쓰|사용)|세척|소독|부품|깔대기|깔때기|튜브|호스|압력|흡입|모드|소리|소음|역류|작동|배터리|충전|건전지|무선|고장|문제|안\s*켜|안\s*빨|약해|에러|아파/],
];

function detectByKeyword(utterance: string): Intent {
  for (const [intent, re] of RULES) {
    if (re.test(utterance)) return intent;
  }
  return "UNKNOWN";
}

/* ------------------------------------------------------------------ */
/* 직전 의도로 재해석                                                    */
/* ------------------------------------------------------------------ */

/** 주어가 생략된 짧은 되물음. "얼마에요?" "언제요?" */
const ELLIPSIS_RE = /얼마|비용|가격|금액|몇\s*원|무료|언제|며칠|기간|어디|어떻게|방법/;

/** 직전 의도를 물려받을 수 있는 의도들 */
const CARRYABLE: Intent[] = [
  "EXTEND", "RETURN", "OVERDUE", "PARTS", "CHANGE", "DELIVERY", "MANUAL", "LOOKUP",
];

/**
 * v4 버그 ②' 해결.
 *   "연장하고 싶어" → EXTEND 인식
 *   "얼마에요?"     → 지금까지 폴백 → 직전 EXTEND 로 해석
 *
 * 직전 1턴만 유효하다. session.intent 는 매 턴 덮어써지므로
 * 다른 의도가 한 번이라도 잡히면 자동으로 무효화된다.
 * 긴 문장은 새 질문으로 보고 물려받지 않는다.
 */
function carryOverIntent(utterance: string, prevIntent: string): Intent | null {
  if (!prevIntent) return null;
  if (utterance.length > 25) return null;
  if (!ELLIPSIS_RE.test(utterance)) return null;
  return CARRYABLE.includes(prevIntent as Intent) ? (prevIntent as Intent) : null;
}

/* ------------------------------------------------------------------ */
/* 의도별 응답                                                          */
/* ------------------------------------------------------------------ */

function respond(intent: Intent, r: Rental, utterance: string) {
  const simile = isSimile(String(r.data["제품"] ?? ""));

  switch (intent) {
    case "GREET":
      return simpleText("네, 안녕하세요! 무엇을 도와드릴까요?", { quickReplies: quickFor(r) });

    case "OPEN":
      return simpleText(
        "네, 편하게 말씀해 주세요.\n\n" +
          "기기 사용, 반납, 연장, 부품 구매, 기종 변경 등\n" +
          "어떤 것이든 물어보시면 확인해 드릴게요.",
        { quickReplies: quickFor(r) }
      );

    case "AGENT":
      return textCard({
        title: "상담원을 연결해 드릴게요",
        description:
          "아래 버튼을 눌러주세요." +
          (agentHoursNote() || "\n\n운영시간은 평일 09:00~18:00 입니다."),
        buttons: [operatorButton()],
      });

    case "OVERDUE": {
      const fee = overdueFee(r);
      if (fee.days === 0) {
        return simpleText(
          `연체된 상태가 아니에요.\n만기일은 ${ymd(r.data["종료일"])} 입니다.`,
          { quickReplies: quickFor(r) }
        );
      }
      return itemCard({
        headTitle: "연체료 안내",
        itemList: [
          { title: "기종", description: text(r.data["제품"]) },
          { title: "만기일", description: ymd(r.data["종료일"]) },
          { title: "연체일", description: `${fee.days}일` },
          { title: "일단가", description: `${fee.daily.toLocaleString()}원` },
        ],
        summary: { title: "연체료", description: `${fee.amount.toLocaleString()}원` },
        description: "연체료는 자정마다 하루치씩 올라갑니다.\n반납 접수 전에 결제가 필요해요.",
        buttons: [operatorButton()],
      });
    }

    case "RETURN":
      if (r.recovered) {
        return simpleText(`이미 회수가 완료된 건이에요.\n회수일 ${ymd(r.data["반납완료일"])}`);
      }
      if (r.pickupRequested) {
        return simpleText(
          `이미 반납 접수가 완료되었어요.\n수거 예정일 ${ymd(r.data["반납요청일"])}\n\n` +
            "일정 변경은 어렵고, 취소는 상담원을 통해서만 가능해요."
        );
      }
      return textCard({
        title: "반납 접수를 도와드릴게요",
        description:
          "받으셨던 전용 상자와 에어캡이 모두 있어야 접수가 가능해요.\n\n" +
          "· 접수 마감 월~토 오후 5시\n" +
          "· 당일 수거는 불가하며 다음 영업일부터 가능해요\n" +
          "· 공휴일은 접수·수거하지 않아요\n\n" +
          "곧 접수 화면을 연결해 드릴 예정입니다.",
        buttons: [
          { label: "반납 안내 보기", action: "webLink", webLinkUrl: LINKS.returnGuide },
          operatorButton(),
        ],
      });

    case "EXTEND":
      return textCard({
        title: "연장을 도와드릴게요",
        description:
          `현재 만기일은 ${ymd(r.data["종료일"])} 입니다.\n\n` +
          "연장 금액은 기종과 대여처에 따라 달라요.\n" +
          "정확한 금액은 상담원이 안내해 드릴게요.",
        buttons: [operatorButton()],
      });

    case "PARTS":
      return textCard({
        title: "부품 구매 안내",
        description: simile
          ? "시밀레 부품은 27mm 단일 사이즈입니다.\n구매는 상담원을 통해 안내해 드릴게요."
          : "부품은 스마트스토어에서 구매하실 수 있어요.\n\n" +
            "· 깔때기는 키트 단위로 판매됩니다\n" +
            "· 양쪽 유축을 하시려면 2세트가 필요해요\n" +
            "· 튜브는 심포니용과 스윙용이 호환되지 않습니다\n\n" +
            "어떤 부품이 필요하신지 알려주시면 확인해 드릴게요.",
        buttons: simile
          ? [operatorButton()]
          : [
              { label: "스마트스토어", action: "webLink", webLinkUrl: LINKS.parts },
              operatorButton(),
            ],
      });

    case "CHANGE":
      return textCard({
        title: "기종 변경 안내",
        description:
          `현재 ${text(r.data["제품"])} 사용 중이세요.\n\n` +
          "기종을 바꾸실 때는 변경 비용을 먼저 결제하셔야\n" +
          "새 기기가 발송되고 기존 기기 수거가 접수됩니다.\n\n" +
          "· 부품이 호환되지 않으면 부품도 함께 준비하셔야 해요\n" +
          "· 발송 일정은 결제 시점에 따라 달라집니다\n\n" +
          "정확한 금액과 일정은 상담원이 안내해 드릴게요.",
        buttons: [operatorButton()],
      });

    case "MANUAL":
      return textCard({
        title: "제품 설명서",
        description: `${text(r.data["제품"])} 설명서를 확인하실 수 있어요.`,
        buttons: [
          {
            label: "설명서 보기",
            action: "webLink",
            webLinkUrl: simile ? SIMILE_LINKS.manual : LINKS.returnGuide,
          },
          operatorButton(),
        ],
      });

    case "DELIVERY":
      return simpleText(
        `택배 발송일은 ${ymd(r.data["택배발송일"])} 입니다.\n` +
          "발송 후 보통 1~2일이면 도착해요.\n\n" +
          "3일이 지나도 안 오면 상담원을 연결해 드릴게요.",
        { quickReplies: quickFor(r) }
      );

    case "TROUBLE":
      // handleTrouble 에서 처리되므로 여기까지 오지 않는다 (안전망)
      return simpleText(FAQ_MENU, { quickReplies: symptomQuick() });

    case "UNKNOWN":
      return simpleText(
        "말씀하신 내용을 정확히 이해하지 못했어요.\n" +
          "조금 더 자세히 알려주시면 도움이 될 것 같아요.\n\n" +
          "혹시 아래 중 하나인가요?",
        { quickReplies: quickFor(r) }
      );

    default:
      return renderRental(r);
  }
}

/* ------------------------------------------------------------------ */
/* 대여정보 카드                                                        */
/* ------------------------------------------------------------------ */

function renderRental(r: Rental) {
  const fee = overdueFee(r);

  const itemList = [
    { title: "이름", description: maskName(r.data["수취인명"]) },
    { title: "연락처", description: maskPhone(r.data["연락처1"]) },
    { title: "대여처", description: text(r.data["거래처분류"]) },
    { title: "기종", description: text(r.data["제품"]) },
    { title: "시작일", description: ymd(r.data["시작일"]) },
    { title: "만기일", description: ymd(r.data["종료일"]) },
    { title: "상태", description: statusLabel(r) },
    { title: "주소", description: maskAddress(r.data["계약자주소"]) },
  ];

  if (fee.days > 0) {
    itemList.push({
      title: "연체",
      description: `${fee.days}일 · ${fee.amount.toLocaleString()}원`,
    });
  }

  return itemCard(
    {
      headTitle: "대여 정보",
      itemList,
      summary:
        fee.days > 0
          ? { title: "연체료", description: `${fee.amount.toLocaleString()}원` }
          : undefined,
      description: "궁금하신 점은 무엇이든 편하게 물어보세요.",
      buttons: [operatorButton()],
    },
    { quickReplies: quickFor(r) }
  );
}

/* ------------------------------------------------------------------ */
/* 빠른 응답                                                            */
/* ------------------------------------------------------------------ */

const UNRESOLVED_QUICK: QuickReply = {
  label: "해봐도 안 돼요",
  action: "message",
  messageText: "그래도 안 되는데요",
};

/** 증상 선택지. extra 로 symptom 을 넘겨 CLOVA 를 건너뛴다 */
function symptomQuick(): QuickReply[] {
  return [
    ...SYMPTOM_CHOICES.map((c) => ({
      label: c.label,
      action: "message" as const,
      messageText: c.say,
      extra: { symptom: c.symptom },
    })),
    { label: "상담원 연결", action: "message", messageText: "상담원 연결해주세요" },
  ];
}

function quickFor(r: Rental): QuickReply[] {
  if (r.recovered) {
    return [
      { label: "다시 대여하기", action: "message", messageText: "재대여 하고 싶어요" },
      { label: "다른 문의", action: "message", messageText: "다른 걸 물어보고 싶어요" },
    ];
  }
  if (r.pickupRequested) {
    return [
      { label: "수거일 확인", action: "message", messageText: "수거 언제 오나요" },
      { label: "다른 문의", action: "message", messageText: "다른 걸 물어보고 싶어요" },
      { label: "상담원 연결", action: "message", messageText: "상담원 연결해주세요" },
    ];
  }

  const out: QuickReply[] = [];
  if (overdueFee(r).days > 0) {
    out.push({ label: "연체료 안내", action: "message", messageText: "연체료 얼마인가요" });
  }
  out.push({ label: "반납할게요", action: "message", messageText: "반납하고 싶어요" });
  out.push({ label: "연장할게요", action: "message", messageText: "연장하고 싶어요" });
  out.push({ label: "기기 문제", action: "message", messageText: "기기에 문제가 있어요" });
  out.push({ label: "부품 구매", action: "message", messageText: "부품 구매하고 싶어요" });
  out.push({ label: "다른 문의", action: "message", messageText: "다른 걸 물어보고 싶어요" });
  return out;
}
