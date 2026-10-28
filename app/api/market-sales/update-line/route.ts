import { NextResponse } from "next/server";
import { updateMarketSalesLine, type UpdateLineField } from "@/api/market-sales/_lib/marketSalesService";
import { isMarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

const VALID_FIELDS: UpdateLineField[] = ["품목", "품목명", "수량", "단가"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const channel = body?.channel;
  const id = Number(body?.id);
  const field = body?.field;
  const value = body?.value;

  if (!isMarketSalesChannel(channel)) {
    return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
  }
  if (!Number.isFinite(id) || !VALID_FIELDS.includes(field)) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const result = await updateMarketSalesLine(channel, id, field, String(value ?? ""));
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: result.reason === "NOT_FOUND" ? 404 : 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/market-sales/update-line error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
