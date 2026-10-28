// app/views/marketSales/service.ts

import type { MarketSalesChannel, MarketSalesRow } from "@/views/marketSales/types";

export async function fetchMarketSales(channel: MarketSalesChannel): Promise<MarketSalesRow[]> {
  const r = await fetch(`/api/market-sales?channel=${encodeURIComponent(channel)}`, { cache: "no-store" });
  if (!r.ok) throw new Error("매출 목록을 불러오지 못했습니다.");
  const j = await r.json();
  return j.rows || [];
}

export async function deleteMarketSales(channel: MarketSalesChannel, ids: number[]): Promise<void> {
  const r = await fetch(`/api/market-sales/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, ids }),
  });
  if (!r.ok) throw new Error("삭제하지 못했습니다.");
}

export type SendToEcountResult = { sentCount: number; skippedCount: number };

export async function sendMarketSalesToEcount(
  channel: MarketSalesChannel,
  ids: number[]
): Promise<SendToEcountResult> {
  const r = await fetch(`/api/market-sales/send-to-ecount`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, ids }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j?.error === "CUST_NOT_CONFIGURED") {
      throw new Error("이 채널은 아직 이카운트 거래처코드가 설정되지 않았습니다.");
    }
    throw new Error("이카운트로 전송하지 못했습니다.");
  }
  return { sentCount: j.sentCount || 0, skippedCount: j.skippedCount || 0 };
}
