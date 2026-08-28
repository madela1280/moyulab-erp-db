// app/api/kakao-conversations/[userKey]/end-handling/route.ts
//
// 직원이 ERP에서 "상담종료"를 누를 때 호출 — CS서버 세션의 staffHandling 플래그를 꺼서
// 봇 자동응답을 다시 켠다. CS서버 /api/erp/kakao-conversations/:userKey/end-handling 중계.

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ userKey: string }> }) {
  try {
    const { userKey } = await params;
    if (!userKey?.trim()) {
      return NextResponse.json({ ok: false, error: "missing_user_key" }, { status: 400 });
    }

    const targetUrl = `${getCsBaseUrl()}/api/erp/kakao-conversations/${encodeURIComponent(userKey)}/end-handling`;
    const res = await fetch(targetUrl, { method: "POST", headers: getCsApiHeaders(), cache: "no-store" });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      return NextResponse.json(
        { ok: false, error: data?.message || `cs_server_failed(${res.status})` },
        { status: res.status || 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/kakao-conversations/[userKey]/end-handling error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
