// app/api/market-sales/coupang-rg-snapshot/route.ts
//
// 1단계(데이터 수집 전용) — 로켓그로스 "최근 30일 순판매수량" 일일 스냅샷 적재.
// 이카운트 전송/매출 흐름과 무관(market_sales_data 미사용, 별도 테이블).
// POST { channel: "coupang_jcompany" | "coupang_hanmojeong", date: "YYYY-MM-DD" }

import { NextRequest, NextResponse } from "next/server";
import { captureCoupangRgSalesCountSnapshot } from "@/api/market-sales/_lib/marketSalesRocketGrowthCancelSnapshot";
import { isMarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const channel = body?.channel;
  const date = body?.date;

  if (!isMarketSalesChannel(channel)) return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });

  const result = await captureCoupangRgSalesCountSnapshot(channel, date);
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason });

  return NextResponse.json(result);
}
