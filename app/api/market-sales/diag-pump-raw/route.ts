// app/api/market-sales/diag-pump-raw/route.ts
//
// 진단 전용(수동 호출, 읽기만 함) — 유축기 productId만 걸러서 orderId+productId로 묶은 원본
// 그룹 구조를 그대로 보여준다. orderId 그룹핑이 실데이터와 맞는지 확인하기 위한 용도(쓰기 없음).
// POST { date: "YYYY-MM-DD" }

import { NextRequest, NextResponse } from "next/server";
import { getNaverCredentials, fetchNaverProductOrders } from "@/api/market-sales/_lib/naverApiClient";
import { toKstIsoDayRange } from "@/api/market-sales/_lib/marketSalesDate";
import { PUMP_PRODUCT_IDS } from "@/api/market-sales/_lib/marketSalesPumpMapping";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const date = body?.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }

  const creds = getNaverCredentials("smartstore");
  if (!creds) return NextResponse.json({ error: "CREDENTIALS_NOT_CONFIGURED" }, { status: 400 });

  const { fromISO, toISO } = toKstIsoDayRange(date);
  const fetchResult = await fetchNaverProductOrders(creds, fromISO, toISO);
  if (!fetchResult.ok) return NextResponse.json({ error: fetchResult.reason }, { status: 400 });

  const pumpEntries = fetchResult.data.filter((e) => PUMP_PRODUCT_IDS.has(e.productId));

  const groups = new Map<string, typeof pumpEntries>();
  for (const e of pumpEntries) {
    const key = e.orderId ? `${e.orderId}|${e.productId}` : `SOLO:${e.productOrderId}`;
    const list = groups.get(key) || [];
    list.push(e);
    groups.set(key, list);
  }

  const result = Array.from(groups.entries()).map(([key, entries]) => ({
    key,
    lineCount: entries.length,
    lines: entries.map((e) => ({
      productOrderId: e.productOrderId,
      productName: e.productName,
      productOption: e.productOption,
      quantity: e.quantity,
      totalProductAmount: e.totalProductAmount,
    })),
  }));

  return NextResponse.json({ totalEntries: pumpEntries.length, groupCount: result.length, groups: result });
}
