// app/api/kakao-conversations/[userKey]/reply/route.ts
//
// 직원이 ERP "카카오톡 > 대화조회 > 상담원 연결 요청"에서 답장을 보낼 때 호출.
// CS서버 /api/erp/kakao-conversations/:userKey/reply 를 그대로 중계한다
// (CS서버가 카카오 Event API로 실제 발송 + 로그 기록 + 세션 응대중 플래그 처리까지 함).

import { NextRequest, NextResponse } from "next/server";

const DEFAULT_CS_BASE_URL = "https://return.moulab.kr";

function getCsBaseUrl() {
  return String(process.env.CS_SERVER_BASE_URL || DEFAULT_CS_BASE_URL).replace(/\/+$/, "");
}

function getCsApiHeaders() {
  const apiKey = String(
    process.env.CS_SERVER_API_KEY || process.env.CS_ERP_API_KEY || process.env.ERP_API_KEY || ""
  ).trim();

  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (apiKey) headers["x-erp-api-key"] = apiKey;
  return headers;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ userKey: string }> }) {
  try {
    const { userKey } = await params;
    if (!userKey?.trim()) {
      return NextResponse.json({ ok: false, error: "missing_user_key" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const message = String(body?.message || "").trim();
    if (!message) {
      return NextResponse.json({ ok: false, error: "missing_message" }, { status: 400 });
    }

    const targetUrl = `${getCsBaseUrl()}/api/erp/kakao-conversations/${encodeURIComponent(userKey)}/reply`;
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: getCsApiHeaders(),
      body: JSON.stringify({ message }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      return NextResponse.json(
        { ok: false, error: data?.message || `cs_server_failed(${res.status})` },
        { status: res.status || 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/kakao-conversations/[userKey]/reply error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
