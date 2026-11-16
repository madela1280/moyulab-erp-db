// app/api/market-sales/manual-rg-cancel-correction-nov/route.ts
//
// 일회성 전용 — 11/1~15 전체 삭제 후 재전송하면서 같이 지워진 로켓그로스 즉시취소 보정을
// 다시 1회 전송한다(기존 manual-rg-cancel-correction의 11월 몫과 동일 금액). 사용 후 삭제할 것.

import { NextResponse } from "next/server";
import { registerEcountSale } from "@/api/lotte-shipment/_lib/ecountSaveSale";
import { CHANNEL_CUST, CHANNEL_WH_CD } from "@/api/market-sales/_lib/marketSalesChannels";
import { toEcountIoDate } from "@/api/market-sales/_lib/marketSalesDate";

export async function POST() {
  const cust = CHANNEL_CUST["coupang_jcompany"];
  const whCd = CHANNEL_WH_CD["coupang_jcompany"];

  const lines = [
    { PROD_CD: "U0001", QTY: -7, PRICE: 13409 },
    { PROD_CD: "U0002", QTY: -1, PRICE: 12200 },
    { PROD_CD: "U0009", QTY: -3, PRICE: 14318 },
    { PROD_CD: "U0006", QTY: -32, PRICE: 23225 },
    { PROD_CD: "SET0017", QTY: -17, PRICE: 12701 },
    { PROD_CD: "SET0013", QTY: -20, PRICE: 12345 },
    { PROD_CD: "SET0011", QTY: -10, PRICE: 12091 },
  ];

  const result = await registerEcountSale({
    cust,
    whCd,
    lines,
    ioDate: toEcountIoDate("2026-11-15"),
    groupAsOneSlip: true,
  });

  return NextResponse.json({ ioDate: "2026-11-15", lines, result });
}
