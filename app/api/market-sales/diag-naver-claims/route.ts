// app/api/market-sales/diag-naver-claims/route.ts
//
// 진단 전용(수동 호출, 읽기만 함) — 반품/교환/취소(클레임) 구조를 파악하기 위해, 공식 문서 없이
// 실데이터로 productOrderStatus 값들과 claim 관련 필드(cancel/return/exchange/currentClaim/
// beforeClaim)를 그대로 덤프한다. fetchNaverProductOrders처럼 취소건을 걸러내지 않는다.
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
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "NON_JSON", bodyLength: text.length, body: text.slice(0, 1000) }, { status: 400 });
  }

  const list: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json?.data?.contents) ? json.data.contents : [];

  const statusCounts: Record<string, number> = {};
  const claimSamples: any[] = [];
  const rawSamples: any[] = [];
  const wantRawFor = new Set(["RETURNED", "CANCELED", "EXCHANGED"]);

  for (const item of list) {
    const content = item?.content || item || {};
    const po = content?.productOrder || {};
    const status = String(po.productOrderStatus || "UNKNOWN");
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const hasClaim = po.cancel || po.return || po.exchange || po.currentClaim || po.beforeClaim;
    if (hasClaim && claimSamples.length < 30) {
      claimSamples.push({
        productOrderId: po.productOrderId,
        productOrderStatus: po.productOrderStatus,
        productId: po.productId,
        productName: po.productName,
        totalProductAmount: po.totalProductAmount,
        cancel: po.cancel,
        return: po.return,
        exchange: po.exchange,
        currentClaim: po.currentClaim,
        beforeClaim: po.beforeClaim,
      });
    }

    // ✅ claim 관련 필드가 productOrder에 안 보이면 구조 자체를 모르는 것 — 전체 content를 통째로
    //    몇 건만 덤프해서 실제 구조를 직접 눈으로 확인한다(문서 접근 불가라서 이 방법밖에 없음).
    if (wantRawFor.has(status) && rawSamples.length < 5) {
      rawSamples.push(content);
    }
  }

  return NextResponse.json({
    totalCount: list.length,
    statusCounts,
    claimSampleCount: claimSamples.length,
    claimSamples,
    rawSamples,
  });
}
