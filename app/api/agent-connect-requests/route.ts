// app/api/agent-connect-requests/route.ts
//
// "카카오톡 > 대화조회" 화면 오른쪽 패널(상담원 연결 요청)용 API.
// CS서버(moulab-customer-reception)의 /api/erp/agent-connect-requests를 그대로 중계한다.

import { NextResponse } from "next/server";

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

export async function GET() {
  try {
    const res = await fetch(`${getCsBaseUrl()}/api/erp/agent-connect-requests`, {
      headers: getCsApiHeaders(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      return NextResponse.json(
        { ok: false, error: data?.message || `cs_server_failed(${res.status})`, rows: [] },
        { status: res.status || 502 }
      );
    }

    return NextResponse.json({ ok: true, rows: data.rows || [] });
  } catch (e) {
    console.error("GET /api/agent-connect-requests error:", e);
    return NextResponse.json({ ok: false, error: "server", rows: [] }, { status: 500 });
  }
}
