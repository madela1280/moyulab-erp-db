// app/api/kakao-conversations/route.ts
//
// "카카오톡 > 대화조회" 화면용 API. CS서버(moulab-customer-reception)의
// /api/erp/kakao-conversations를 그대로 중계한다 — 카카오 관리자 화면에서는 챗봇 대화가
// 안정적으로 안 보이므로(1:1채팅/상담톡 전부 챗봇과 병행 불가 확인됨), ERP가 CS서버 DB를 직접 조회한다.
//
// ⚠ ERP/CS서버 분리 원칙: CS서버 DB(moulab_cs)를 여기서 직접 쿼리하지 않는다.
//   반드시 CS서버의 인증된 API(x-erp-api-key)를 호출한다.

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

export async function GET(req: NextRequest) {
  try {
    const phone = req.nextUrl.searchParams.get("phone") || "";

    const targetUrl = new URL(`${getCsBaseUrl()}/api/erp/kakao-conversations`);
    if (phone.trim()) targetUrl.searchParams.set("phone", phone.trim());

    const res = await fetch(targetUrl.toString(), { headers: getCsApiHeaders(), cache: "no-store" });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      return NextResponse.json(
        { ok: false, error: data?.message || `cs_server_failed(${res.status})`, rows: [] },
        { status: res.status || 502 }
      );
    }

    return NextResponse.json({ ok: true, rows: data.rows || [] });
  } catch (e) {
    console.error("GET /api/kakao-conversations error:", e);
    return NextResponse.json({ ok: false, error: "server", rows: [] }, { status: 500 });
  }
}
