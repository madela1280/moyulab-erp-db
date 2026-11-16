// app/api/market-sales/diag-coupang-returns/route.ts
//
// 진단 전용(수동 호출) — 로켓그로스 매출에서 반품/취소가 전혀 빠지지 않는 문제의 원인 확인용.
// 쿠팡 공식 "반품/취소 요청 목록 조회"(v6/returnRequests) API 원본 응답을 그대로 돌려준다.
// POST { channel: "coupang_jcompany" | "coupang_hanmojeong", from: "YYYY-MM-DD", to: "YYYY-MM-DD" }

import { NextRequest, NextResponse } from "next/server";
import { getCoupangCredentials, fetchCoupangReturnRequestsRaw } from "@/api/market-sales/_lib/coupangApiClient";
import { isMarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const channel = body?.channel;
  const from = body?.from;
  const to = body?.to;
  const cancelType = body?.cancelType === "CANCEL" ? "CANCEL" : undefined;

  if (!isMarketSalesChannel(channel)) return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
  if (typeof from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return NextResponse.json({ error: "INVALID_FROM" }, { status: 400 });
  if (typeof to !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ error: "INVALID_TO" }, { status: 400 });

  const creds = getCoupangCredentials(channel);
  if (!creds) return NextResponse.json({ error: "CREDENTIALS_NOT_CONFIGURED" }, { status: 400 });

  const result = await fetchCoupangReturnRequestsRaw(creds, from, to, cancelType);

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, firstPageRaw: result.firstPageRaw }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    totalRows: result.raw.length,
    rows: result.raw,
    firstPageRaw: result.firstPageRaw,
  });
}
