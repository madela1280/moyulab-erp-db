// app/api/kakao/_lib/kakao.ts
//
// 카카오 오픈빌더 스킬 공통 유틸
// - 요청(SkillPayload)에서 값 꺼내기
// - 응답(SkillResponse) 만들기
// - 개인정보 마스킹

import { NextResponse } from "next/server";

export type QuickReply = {
  label: string;
  action: "message" | "block";
  messageText?: string;
  blockId?: string;
  extra?: Record<string, unknown>;
};

export type Button = {
  label: string;
  action: "webLink" | "message" | "block" | "operator";
  webLinkUrl?: string;
  messageText?: string;
  blockId?: string;
};

/* ------------------------------------------------------------------ */
/* 요청에서 값 꺼내기                                                   */
/* ------------------------------------------------------------------ */

export function getUserKey(body: any): string {
  return String(body?.userRequest?.user?.id ?? "").trim();
}

export function getUtterance(body: any): string {
  return String(body?.userRequest?.utterance ?? "").trim();
}

export function getClientExtra(body: any): Record<string, any> {
  const raw = body?.action?.clientExtra;
  return raw && typeof raw === "object" ? raw : {};
}

export function onlyDigits(v: unknown): string {
  return String(v ?? "").replace(/[^0-9]/g, "");
}

export function isMobilePhone(v: unknown): boolean {
  return /^01[016789]\d{7,8}$/.test(onlyDigits(v));
}

/**
 * 발화·파라미터·clientExtra 어디에 들어와도 휴대폰 번호를 찾아낸다.
 * 파라미터 엔티티가 sys.text라 값이 어디로 올지 확정되지 않으므로 넓게 훑는다.
 */
export function extractPhone(body: any): string {
  const dp = body?.action?.detailParams ?? {};
  const p = body?.action?.params ?? {};
  const extra = getClientExtra(body);

  const candidates: unknown[] = [
    extra?.phone,
    dp?.전화?.origin, dp?.전화?.value,
    dp?.전화번호?.origin, dp?.전화번호?.value,
    dp?.phone?.origin, dp?.phone?.value,
    p?.전화, p?.전화번호, p?.phone,
  ];

  for (const c of candidates) {
    if (isMobilePhone(c)) return onlyDigits(c);
  }

  const m = getUtterance(body).match(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/);
  if (m && isMobilePhone(m[0])) return onlyDigits(m[0]);

  return "";
}

/* ------------------------------------------------------------------ */
/* 마스킹                                                              */
/* ------------------------------------------------------------------ */

export function maskName(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  if (s.length === 1) return s;
  if (s.length === 2) return `${s[0]}*`;
  return `${s[0]}${"*".repeat(s.length - 2)}${s[s.length - 1]}`;
}

export function maskPhone(v: unknown): string {
  const d = onlyDigits(v);
  if (d.length < 7) return "-";
  if (d.length === 11) return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
  return `***-****-${d.slice(-4)}`;
}

export function maskAddress(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const parts = s.split(/\s+/);
  return `${parts.slice(0, 3).join(" ")} ***`;
}

/* ------------------------------------------------------------------ */
/* 응답 만들기                                                          */
/* ------------------------------------------------------------------ */

type Options = { quickReplies?: QuickReply[] };

function wrap(outputs: any[], opts?: Options) {
  const payload: any = { version: "2.0", template: { outputs } };
  if (opts?.quickReplies?.length) {
    payload.template.quickReplies = opts.quickReplies.slice(0, 10);
  }
  return payload;
}

/** 단순 텍스트 (최대 1000자) */
export function simpleText(text: string, opts?: Options) {
  return NextResponse.json(wrap([{ simpleText: { text: text.slice(0, 1000) } }], opts));
}

/** 제목 + 설명 + 버튼 */
export function textCard(
  args: { title?: string; description?: string; buttons?: Button[] },
  opts?: Options
) {
  const card: any = {};
  if (args.title) card.title = args.title.slice(0, 50);
  if (args.description) card.description = args.description.slice(0, 400);
  if (args.buttons?.length) {
    card.buttons = args.buttons.slice(0, 3);
    card.buttonLayout = "vertical";
  }
  return NextResponse.json(wrap([{ textCard: card }], opts));
}

/** 항목형 카드. itemList의 title은 최대 6자 제한 */
export function itemCard(
  args: {
    headTitle?: string;
    itemList: { title: string; description: string }[];
    summary?: { title: string; description: string };
    description?: string;
    buttons?: Button[];
  },
  opts?: Options
) {
  const card: any = {
    itemList: args.itemList.slice(0, 10).map((it) => ({
      title: it.title.slice(0, 6),
      description: it.description,
    })),
    itemListAlignment: "right",
  };
  if (args.headTitle) card.head = { title: args.headTitle };
  if (args.summary) card.itemListSummary = args.summary;
  if (args.description) card.description = args.description;
  if (args.buttons?.length) {
    card.buttons = args.buttons.slice(0, 3);
    card.buttonLayout = "vertical";
  }
  return NextResponse.json(wrap([{ itemCard: card }], opts));
}

/** 여러 건 중 하나 고르기. items 최대 5개 */
export function listCard(
  args: {
    headerTitle: string;
    items: {
      title: string;
      description?: string;
      action?: "message";
      messageText?: string;
      extra?: Record<string, unknown>;
    }[];
  },
  opts?: Options
) {
  return NextResponse.json(
    wrap(
      [{ listCard: { header: { title: args.headerTitle }, items: args.items.slice(0, 5) } }],
      opts
    )
  );
}

/** 상담원 연결 버튼 */
export function operatorButton(label = "상담원 연결"): Button {
  return { label, action: "operator" };
}
