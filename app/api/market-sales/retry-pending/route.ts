import { NextResponse } from "next/server";
import { retryPendingMarketSales } from "@/api/market-sales/_lib/marketSalesService";
import { isMarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

// 채널의 '미전송'(매칭 완료, 전송만 실패한) 건을 전부 다시 전송한다. 매일 자동수집 뒤에
// 크론에서 호출해서, 자동전송 실패 건이 다음날까지 조용히 남지 않게 한다.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const channel = body?.channel;

  if (!isMarketSalesChannel(channel)) {
    return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
  }

  try {
    const result = await retryPendingMarketSales(channel);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("POST /api/market-sales/retry-pending error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
