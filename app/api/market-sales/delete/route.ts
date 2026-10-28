import { NextResponse } from "next/server";
import { deleteMarketSales } from "@/api/market-sales/_lib/marketSalesService";
import { isMarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const channel = body?.channel;
  const idsRaw = body?.ids;

  if (!isMarketSalesChannel(channel)) {
    return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
  }
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const result = await deleteMarketSales(channel, idsRaw);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("POST /api/market-sales/delete error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
