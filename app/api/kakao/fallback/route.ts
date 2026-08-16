// app/api/kakao/fallback/route.ts
//
// [블록] 폴백 블록 — 챗봇의 정문
// 고객이 무슨 말을 하든 여기로 들어온다.
//
// 스킬 URL: https://moulab.kr/api/kakao/fallback
//
// 처리 순서
//   ① 발화에 전화번호가 있으면 → 인증 시도
//   ② 인증 안 된 상태 → 인사말 + 번호 요청
//   ③ 인증된 상태 → 의도 판단 후 안내
//
// 지금은 키워드로 의도를 판단한다. CLOVA 연동은 다음 단계에서 이 파일의
// detectIntent 함수만 교체하면 된다.

import { NextRequest } from "next/server";
import {
  extractPhone,
  getClientExtra,
  getUserKey,
  getUtterance,
  itemCard,
  listCard,
  maskAddress,
  maskName,
  maskPhone,
  operatorButton,
  simpleText,
  textCard,
  type QuickReply,
} from "@/api/kakao/_lib/kakao";
import { getSession, setSession, sweepExpired } from "@/api/kakao/_lib/session";
import {
  findById,
  findByPhone,
  overdueFee,
  statusLabel,
  text,
  ymd,
  type Rental,
} from "@/api/kakao/_lib/rental";

export const dynamic = "force-dynamic";

const GREETING =
  "안녕하세요, 모유랩입니다 🍼\n\n" +
  "여기서 이런 것들을 확인하실 수 있어요.\n\n" +
  "· 대여 기간, 만기일 확인\n" +
  "· 반납 접수\n" +
  "· 연장 신청\n" +
  "· 연체료 · 환불금 조회\n" +
  "· 사용법, 세척 방법 안내\n\n" +
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

    // ① 발화에 번호가 있으면 인증 시도
    const phone = extractPhone(body);
    if (phone) return await authenticate(userKey, phone);

    // ② 인증 상태 확인
    const session = await getSession(userKey);
    if (!session.unifiedId) return simpleText(GREETING);

    const rental = await findById(session.unifiedId);
    if (!rental) return simpleText(GREETING);

    // ③ 의도 판단 후 안내
    const intent = detectIntent(utterance);
    await setSession(userKey, { intent });

    return respond(intent, rental);
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

  // 여러 건이면 고르게 한다 (기본기기 + 업그레이드기기 등)
  if (rows.length > 1) {
    await setSession(userKey, { phoneTail, intent: "PICK" });
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
/* 의도 판단 (지금은 키워드. 다음 단계에서 CLOVA로 교체)                 */
/* ------------------------------------------------------------------ */

type Intent =
  | "RETURN" | "EXTEND" | "OVERDUE" | "TROUBLE"
  | "DELIVERY" | "AGENT" | "LOOKUP";

const RULES: [Intent, RegExp][] = [
  // 긴급·불만은 무조건 상담원 우선
  ["AGENT", /역류|물\s*들어|고장|파손|깨졌|잘못\s*왔|오배송|분실|환불해|화가|짜증|상담원|사람/],
  ["OVERDUE", /연체|늦었|지났|기간\s*넘/],
  ["RETURN", /반납|회수|수거|가져가|돌려/],
  ["EXTEND", /연장|더\s*쓰|더쓰|늘리|기간\s*추가/],
  ["DELIVERY", /배송|택배|송장|언제\s*와|도착|발송/],
  ["TROUBLE", /사용법|어떻게\s*써|세척|소독|부품|깔때기|튜브|흡입|소리/],
];

function detectIntent(utterance: string): Intent {
  for (const [intent, re] of RULES) {
    if (re.test(utterance)) return intent;
  }
  return "LOOKUP";
}

/* ------------------------------------------------------------------ */
/* 의도별 응답                                                          */
/* ------------------------------------------------------------------ */

function respond(intent: Intent, r: Rental) {
  switch (intent) {
    case "AGENT":
      return textCard({
        title: "상담원을 연결해 드릴게요",
        description: "아래 버튼을 눌러주세요.\n운영시간은 평일 09:00~18:00 입니다.",
        buttons: [operatorButton()],
      });

    case "OVERDUE": {
      const fee = overdueFee(r);
      if (fee.days === 0) {
        return simpleText("연체된 상태가 아니에요.\n만기일은 " + ymd(r.data["종료일"]) + " 입니다.", {
          quickReplies: quickFor(r),
        });
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
        return simpleText("이미 회수가 완료된 건이에요.\n회수일 " + ymd(r.data["반납완료일"]));
      }
      if (r.pickupRequested) {
        return simpleText(
          "이미 반납 접수가 완료되었어요.\n수거 예정일 " + ymd(r.data["반납요청일"]) +
          "\n\n일정 변경은 어렵고, 취소는 상담원을 통해서만 가능해요."
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
        buttons: [operatorButton()],
      });

    case "EXTEND":
      return textCard({
        title: "연장을 도와드릴게요",
        description:
          `현재 만기일은 ${ymd(r.data["종료일"])} 입니다.\n\n` +
          "연장 금액은 기종과 기간에 따라 달라요.\n" +
          "곧 자동 안내를 준비하고 있습니다.",
        buttons: [operatorButton()],
      });

    case "DELIVERY":
      return simpleText(
        `택배 발송일은 ${ymd(r.data["택배발송일"])} 입니다.\n` +
        "발송 후 보통 1~2일이면 도착해요.\n\n" +
        "3일이 지나도 안 오면 상담원을 연결해 드릴게요.",
        { quickReplies: quickFor(r) }
      );

    case "TROUBLE":
      return textCard({
        title: "사용법 안내",
        description:
          "자주 묻는 내용을 정리해 두었어요.\n\n" +
          "· 흡입력이 약할 때: 밸브와 멤브레인 확인\n" +
          "· 소리가 클 때: 튜브 연결 상태 확인\n" +
          "· 세척: 깔때기와 밸브만 분리 세척\n\n" +
          "해결이 안 되면 상담원을 연결해 드릴게요.",
        buttons: [operatorButton()],
      });

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
      buttons: [operatorButton()],
    },
    { quickReplies: quickFor(r) }
  );
}

function quickFor(r: Rental): QuickReply[] {
  if (r.recovered) {
    return [{ label: "다시 대여하기", action: "message", messageText: "재대여 하고 싶어요" }];
  }
  if (r.pickupRequested) {
    return [{ label: "상담원 연결", action: "message", messageText: "상담원 연결해주세요" }];
  }

  const out: QuickReply[] = [];
  if (overdueFee(r).days > 0) {
    out.push({ label: "연체료 안내", action: "message", messageText: "연체료 얼마인가요" });
  }
  out.push({ label: "반납할게요", action: "message", messageText: "반납하고 싶어요" });
  out.push({ label: "연장할게요", action: "message", messageText: "연장하고 싶어요" });
  out.push({ label: "사용법 보기", action: "message", messageText: "사용법 알려주세요" });
  return out;
}
