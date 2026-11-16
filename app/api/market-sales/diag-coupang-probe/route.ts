// app/api/market-sales/diag-coupang-probe/route.ts
//
// 진단 전용(수동 호출) — 로켓그로스 취소금액을 API로 자동 수집할 방법을 찾기 위한 범용 프로브.
// POST { channel, path, query }  (path는 "/v2/providers/..." 형태 절대경로, query는 객체)

import { NextRequest, NextResponse } from "next/server";
import { getCoupangCredentials, fetchCoupangRawProbe } from "@/api/market-sales/_lib/coupangApiClient";
import { isMarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const channel = body?.channel;
  const path = body?.path;
  const query = body?.query && typeof body.query === "object" ? body.query : {};

  if (!isMarketSalesChannel(channel)) return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
  if (typeof path !== "string" || !path.startsWith("/")) return NextResponse.json({ error: "INVALID_PATH" }, { status: 400 });

  const creds = getCoupangCredentials(channel);
  if (!creds) return NextResponse.json({ error: "CREDENTIALS_NOT_CONFIGURED" }, { status: 400 });

  const resolvedPath = path.replace("{vendorId}", creds.vendorId);
  const result = await fetchCoupangRawProbe(creds, resolvedPath, query);

  return NextResponse.json(result);
}
