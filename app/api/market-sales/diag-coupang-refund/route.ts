// app/api/market-sales/diag-coupang-refund/route.ts
//
// 진단 전용(수동 호출) — 쿠팡 revenue-history 응답 중 saleType !== "SALE"(환불/반품) 건의
// quantity/saleAmount가 이미 마이너스로 내려오는지, 양수(크기)로 내려오는지 실제 값으로 확인하기 위한 용도.
// POST { channel: "coupang_jcompany" | "coupang_hanmojeong", from: "YYYY-MM-DD", to: "YYYY-MM-DD" }

import { NextRequest, NextResponse } from "next/server";
import { getCoupangCredentials, fetchCoupangRevenueHistory } from "@/api/market-sales/_lib/coupangApiClient";
import { isMarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const channel = body?.channel;
  const from = body?.from;
  const to = body?.to;

  if (!isMarketSalesChannel(channel)) return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
  if (typeof from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return NextResponse.json({ error: "INVALID_FROM" }, { status: 400 });
  if (typeof to !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ error: "INVALID_TO" }, { status: 400 });

  const creds = getCoupangCredentials(channel);
  if (!creds) return NextResponse.json({ error: "CREDENTIALS_NOT_CONFIGURED" }, { status: 400 });

  const result = await fetchCoupangRevenueHistory(creds, from, to);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

  const refundEntries = result.entries.filter((e) => e.saleType !== "SALE");

  return NextResponse.json({
    totalEntries: result.entries.length,
    refundEntryCount: refundEntries.length,
    refundEntries,
  });
}
