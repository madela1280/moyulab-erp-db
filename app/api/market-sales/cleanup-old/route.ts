import { NextResponse } from "next/server";
import { deleteOldSentMarketSales } from "@/api/market-sales/_lib/marketSalesService";

// 채널 구분 없이 전체 market_sales_data 대상 — 전송완료(이카운트 반영 끝난) 오래된 건만 정리한다.
// 매일 자동수집 뒤 크론에서 호출. POST { retentionDays?: number } (기본 30일).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const retentionDays = Number.isFinite(body?.retentionDays) ? Number(body.retentionDays) : 30;

  try {
    const result = await deleteOldSentMarketSales(retentionDays);
    return NextResponse.json({ ok: true, retentionDays, ...result });
  } catch (e) {
    console.error("POST /api/market-sales/cleanup-old error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
