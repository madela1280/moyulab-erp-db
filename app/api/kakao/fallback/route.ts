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
//   ④ 의도 판단: 키워드 우선 → 못 잡으면 CLOVA
//   ⑤ 의도별 안내

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

    void sweepExpired();

    // ⓪ 리스트카드에서 특정 대여건을 고른 경우
    const pickedId = Number(getClientExtra(body)?.unifiedId);
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

    // ③ 위험 질문은 답변을 시도하지 않고 바로 상담원
    const risk = checkRisk(utterance);
    if (risk === "medical") {
      await setSession(userKey, { intent: "MEDICAL" });
      return textCard({
        title: "상담원이 확인해 드릴게요",
        description: medicalMessage(),
        buttons: [operatorButton()],
      });
    }
    if (risk === "escalate") {
      await setSession(userKey, { intent: "ESCALATE" });
      return textCard({
        title: "상담원을 연결해 드릴게요",
        description: escalateMessage(),
        buttons: [operatorButton()],
      });
    }

    // ④ 키워드 우선, 못 잡으면 CLOVA
    let intent = detectByKeyword(utterance);

    if (intent === "UNKNOWN" && utterance.length > 0) {
      const r = await classifyIntent(utterance);
      console.log("[CLOVA]", JSON.stringify({ q: utterance.slice(0, 40), ...r }));
      // 확신이 낮으면 억지로 분류하지 않는다
      if (r.ok && r.confidence >= 0.5) intent = r.intent;
    }

    await setSession(userKey, { intent });
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
      quickReplies: [{ label: "상담원 연결", action: "message", messageText: "상담원 연결해주세요" }],
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
/* 의도 판단 — 키워드 (빠른 경로)                                        */
/* ------------------------------------------------------------------ */

const RULES: [Intent, RegExp][] = [
  ["GREET", /^(안녕|하이|헬로|여보세요|안뇽)/],
  ["OPEN", /다른\s*(걸|것|거|문의|질문)|물어보고\s*싶|궁금한\s*(게|것)/],
  ["AGENT", /상담원|직원|통화|전화\s*(주|해)/],
  ["OVERDUE", /연체|늦었|지났|기간\s*넘/],
  ["RETURN", /반납|회수|수거|가져가|돌려|그만\s*(쓰|사용)|다\s*썼/],
  ["EXTEND", /연장|더\s*쓰|더쓰|늘리|기간\s*추가/],
  ["PARTS", /부품.*(구매|사|추가)|깔대기.*(구매|사)|깔때기.*(구매|사)|포장재.*(구매|사)|더\s*사고/],
  ["CHANGE", /기종\s*변경|기기\s*(변경|바꾸)|다른\s*(기기|기종)|교체해/],
  ["MANUAL", /설명서|매뉴얼|사용\s*안내서/],
  ["DELIVERY", /배송|택배|송장|언제\s*와|도착|발송/],
  ["LOOKUP", /내\s*정보|대여\s*정보|만기|언제까지|남은\s*기간|조회|확인/],
  ["TROUBLE", /사용법|어떻게\s*(써|쓰|사용)|세척|소독|부품|깔대기|깔때기|튜브|호스|압력|흡입|모드|소리|소음|역류|작동|배터리|충전|건전지|무선/],
];

function detectByKeyword(utterance: string): Intent {
  for (const [intent, re] of RULES) {
    if (re.test(utterance)) return intent;
  }
  return "UNKNOWN";
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
        description: "아래 버튼을 눌러주세요." +
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
          "· 접수 마감 평일 오후 5시\n" +
          "· 당일 수거는 불가하며 다음 영업일부터 가능해요\n" +
          "· 공휴일은 수거하지 않아요\n\n" +
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
        description:
          simile
            ? "시밀레 부품은 27mm 단일 사이즈입니다.\n" +
              "구매는 상담원을 통해 안내해 드릴게요."
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

    case "TROUBLE": {
      // 시밀레는 메델라와 구조가 달라 자체 자료로만 안내한다
      if (simile) {
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

      const faq = findFaq(utterance);
      if (!faq) return simpleText(FAQ_MENU, { quickReplies: troubleQuick() });

      return textCard(
        {
          title: faq.title,
          description: faq.body + (faq.offerAgent ? "\n\n해결이 안 되면 상담원을 연결해 드릴게요." : ""),
          buttons: faq.offerAgent ? [operatorButton()] : undefined,
        },
        { quickReplies: troubleQuick() }
      );
    }

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
    itemList.push({ title: "연체", description: `${fee.days}일 · ${fee.amount.toLocaleString()}원` });
  }

  return itemCard(
    {
      headTitle: "대여 정보",
      itemList,
      summary: fee.days > 0
        ? { title: "연체료", description: `${fee.amount.toLocaleString()}원` }
        : undefined,
      description: "궁금하신 점은 무엇이든 편하게 물어보세요.",
      buttons: [operatorButton()],
    },
    { quickReplies: quickFor(r) }
  );
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
  out.push({ label: "사용법 보기", action: "message", messageText: "사용법 알려주세요" });
  out.push({ label: "부품 구매", action: "message", messageText: "부품 구매하고 싶어요" });
  out.push({ label: "다른 문의", action: "message", messageText: "다른 걸 물어보고 싶어요" });
  return out;
}

function troubleQuick(): QuickReply[] {
  return [
    { label: "세척 방법", action: "message", messageText: "세척 어떻게 해요" },
    { label: "작동 안 될 때", action: "message", messageText: "기기가 작동하지 않아요" },
    { label: "압력이 약해요", action: "message", messageText: "흡입력이 약해요" },
    { label: "다른 문의", action: "message", messageText: "다른 걸 물어보고 싶어요" },
    { label: "상담원 연결", action: "message", messageText: "상담원 연결해주세요" },
  ];
}
