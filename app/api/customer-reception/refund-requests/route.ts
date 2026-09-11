// app/api/customer-reception/refund-requests/route.ts
//
// 고객접수 > 환불접수. 데이터는 ERP 자체 DB가 아니라 CS서버 자기 DB(refund_requests)에 있다
// (반납접수/return-requests와 완전히 동일한 분리 원칙 — ERP CLAUDE.md 22장). 여기서는 CS서버의
// 인증된 API(/api/erp/refund-requests)만 호출한다.

import { NextRequest, NextResponse } from "next/server";

const DEFAULT_CS_BASE_URL = "https://return.moulab.kr";

function getCsBaseUrl() {
  return String(process.env.CS_SERVER_BASE_URL || DEFAULT_CS_BASE_URL).replace(/\/+$/, "");
}

function getCsApiHeaders(extra?: Record<string, string>) {
  const apiKey = String(
    process.env.CS_SERVER_API_KEY || process.env.CS_ERP_API_KEY || process.env.ERP_API_KEY || ""
  ).trim();

  const headers: Record<string, string> = { Accept: "application/json", ...(extra || {}) };
  if (apiKey) headers["x-erp-api-key"] = apiKey;
  return headers;
}

export async function GET() {
  try {
    const res = await fetch(`${getCsBaseUrl()}/api/erp/refund-requests`, {
      method: "GET",
      cache: "no-store",
      headers: getCsApiHeaders(),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || `환불접수 서버 조회 실패(${res.status})`);
    }

    return NextResponse.json({ ok: true, rows: Array.isArray(data.rows) ? data.rows : [] });
  } catch (e: any) {
    console.error("GET /api/customer-reception/refund-requests error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "server", rows: [] },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const res = await fetch(`${getCsBaseUrl()}/api/erp/refund-requests`, {
      method: "PATCH",
      cache: "no-store",
      headers: getCsApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || `환불접수 수정 실패(${res.status})`);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("PATCH /api/customer-reception/refund-requests error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "server" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const res = await fetch(`${getCsBaseUrl()}/api/erp/refund-requests`, {
      method: "DELETE",
      cache: "no-store",
      headers: getCsApiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      throw new Error(data?.message || `환불접수 삭제 실패(${res.status})`);
    }

    return NextResponse.json({ ok: true, deletedCount: data.deletedCount ?? 0 });
  } catch (e: any) {
    console.error("DELETE /api/customer-reception/refund-requests error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "server" }, { status: 500 });
  }
}
