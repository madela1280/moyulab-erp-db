import { NextResponse } from "next/server";
import { ingestCoupangSalesForDate } from "@/api/market-sales/_lib/marketSalesCoupangIngest";
import { isMarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

// 수동 테스트용 트리거. POST { channel, date: "YYYY-MM-DD" } (매출인식일 기준 하루치).
// ⚠️ 아직 cron 스케줄러에 연결 안 함 — 지금은 직접 호출해서 테스트하는 용도.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const channel = body?.channel;
  const date = body?.date;

  if (!isMarketSalesChannel(channel)) {
    return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }

  try {
    const result = await ingestCoupangSalesForDate(channel, date);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("POST /api/market-sales/coupang-fetch error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
