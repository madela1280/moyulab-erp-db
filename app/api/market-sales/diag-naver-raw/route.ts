// app/api/market-sales/diag-naver-raw/route.ts
//
// 진단 전용(수동 호출) — 네이버 상품주문 조회 API의 원본 응답을 그대로 반환한다.
// 실제 응답 구조(data가 배열인지, data.contents인지 등)를 확인하기 위한 용도.
// POST { date: "YYYY-MM-DD" }

import { NextRequest, NextResponse } from "next/server";
import { getNaverCredentials, getAccessToken } from "@/api/market-sales/_lib/naverApiClient";
import { toKstIsoDayRange } from "@/api/market-sales/_lib/marketSalesDate";

const BASE_URL = "https://api.commerce.naver.com/external";
const PRODUCT_ORDERS_PATH = "/v1/pay-order/seller/product-orders";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const date = body?.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
  }

  const creds = getNaverCredentials("smartstore");
  if (!creds) return NextResponse.json({ error: "CREDENTIALS_NOT_CONFIGURED" }, { status: 400 });

  const tokenResult = await getAccessToken(creds);
  if (!tokenResult.ok) return NextResponse.json({ error: tokenResult.reason }, { status: 400 });

  const { fromISO, toISO } = toKstIsoDayRange(date);
  const params = new URLSearchParams({ from: fromISO, to: toISO, rangeType: "PAYED_DATETIME", pageSize: "300", page: "1" });

  const res = await fetch(`${BASE_URL}${PRODUCT_ORDERS_PATH}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${tokenResult.data}`, Accept: "application/json" },
  });
  const text = await res.text();

  return NextResponse.json({ status: res.status, fromISO, toISO, bodyLength: text.length, body: text.slice(0, 6000) });
}
