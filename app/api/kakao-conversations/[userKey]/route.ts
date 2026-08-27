// app/api/kakao-conversations/[userKey]/route.ts
//
// 특정 고객(user_key)의 전체 대화 내역 — CS서버 /api/erp/kakao-conversations/:userKey 중계.

import { NextRequest, NextResponse } from "next/server";

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
