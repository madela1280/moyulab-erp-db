// app/api/kakao-conversations/[userKey]/route.ts
//
// 특정 고객(user_key)의 전체 대화 내역 — CS서버 /api/erp/kakao-conversations/:userKey 중계.

import { NextRequest, NextResponse } from "next/server";
import { markConversationRead } from "@/api/kakao-conversations/_lib/reads";

const DEFAULT_CS_BASE_URL = "https://return.moulab.kr";

function getCsBaseUrl() {
  return String(process.env.CS_SERVER_BASE_URL || DEFAULT_CS_BASE_URL).replace(/\/+$/, "");
}

function getCsApiHeaders() {
  const apiKey = String(
    process.env.CS_SERVER_API_KEY || process.env.CS_ERP_API_KEY || process.env.ERP_API_KEY || ""
  ).trim();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["x-erp-api-key"] = apiKey;
  return headers;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ userKey: string }> }) {
  try {
    const { userKey } = await params;
    if (!userKey?.trim()) {
      return NextResponse.json({ ok: false, error: "missing_user_key", messages: [] }, { status: 400 });
    }

    const targetUrl = `${getCsBaseUrl()}/api/erp/kakao-conversations/${encodeURIComponent(userKey)}`;
    const res = await fetch(targetUrl, { headers: getCsApiHeaders(), cache: "no-store" });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      return NextResponse.json(
        { ok: false, error: data?.message || `cs_server_failed(${res.status})`, messages: [] },
        { status: res.status || 502 }
      );
    }

    return NextResponse.json({ ok: true, messages: data.messages || [] });
  } catch (e) {
    console.error("GET /api/kakao-conversations/[userKey] error:", e);
    return NextResponse.json({ ok: false, error: "server", messages: [] }, { status: 500 });
  }
}

// 대화를 읽음 처리(직원이 해당 고객 대화를 열었을 때 호출) — ERP 자체 DB에 마지막으로 읽은 시각만 기록한다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ userKey: string }> }) {
  try {
    const { userKey } = await params;
    if (!userKey?.trim()) {
      return NextResponse.json({ ok: false, error: "missing_user_key" }, { status: 400 });
    }

    await markConversationRead(userKey);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/kakao-conversations/[userKey] error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
