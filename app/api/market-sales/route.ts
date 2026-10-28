import { NextResponse } from "next/server";
import { listMarketSales } from "@/api/market-sales/_lib/marketSalesService";
import { isMarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel");

  if (!isMarketSalesChannel(channel)) {
    return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
  }

  try {
    const rows = await listMarketSales(channel);
    return NextResponse.json({ rows });
  } catch (e) {
    console.error("GET /api/market-sales error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
