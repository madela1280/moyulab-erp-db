// app/api/market-sales/manual-rg-cancel-correction/route.ts
//
// 일회성 전용 — 7~11월(15일) 로켓그로스 "즉시취소"(출고전 취소) 미반영분을 쿠팡 Seller Insights
// Vendor Item Metrics 엑셀의 실제 취소금액으로 역산해서 이카운트에 월별 보정(마이너스) 전표로
// 1회 전송한다. 사용 후 이 파일 자체를 삭제할 것.
// POST { monthIndex: 0~4 } — 한 달씩만 보낸다(사고 방지, 한 번에 다 안 보냄).

import { NextRequest, NextResponse } from "next/server";
import { registerEcountSale } from "@/api/lotte-shipment/_lib/ecountSaveSale";
import { CHANNEL_CUST, CHANNEL_WH_CD } from "@/api/market-sales/_lib/marketSalesChannels";
import { toEcountIoDate } from "@/api/market-sales/_lib/marketSalesDate";

// qty/amt는 엑셀의 로켓그로스 "총취소된 상품수"/"총취소 금액"을 품목코드(PROD_CD)별로 합산한 값.
// QTY는 음수(취소), PRICE는 공급가 기준 양수 단가(이카운트가 자체적으로 +10% 부가세를 계산하므로).
const MONTHS: { ioDate: string; lines: { PROD_CD: string; QTY: number; PRICE: number }[] }[] = [
  {
    ioDate: "2026-07-31",
    lines: [
      { PROD_CD: "U0001", QTY: -17, PRICE: 13409 },
      { PROD_CD: "U0002", QTY: -3, PRICE: 11952 },
      { PROD_CD: "U0009", QTY: -34, PRICE: 12682 },
      { PROD_CD: "U0006", QTY: -103, PRICE: 22838 },
      { PROD_CD: "U0010", QTY: -8, PRICE: 80000 },
      { PROD_CD: "SET0017", QTY: -14, PRICE: 12149 },
      { PROD_CD: "SET0013", QTY: -8, PRICE: 12466 },
    ],
  },
  {
    ioDate: "2026-08-31",
    lines: [
      { PROD_CD: "U0001", QTY: -15, PRICE: 13409 },
      { PROD_CD: "U0002", QTY: -5, PRICE: 11945 },
      { PROD_CD: "U0009", QTY: -15, PRICE: 12682 },
      { PROD_CD: "U0006", QTY: -132, PRICE: 23309 },
      { PROD_CD: "U0010", QTY: -3, PRICE: 79200 },
      { PROD_CD: "SET0016", QTY: -15, PRICE: 13121 },
      { PROD_CD: "SET0017", QTY: -77, PRICE: 12727 },
      { PROD_CD: "SET0013", QTY: -64, PRICE: 12210 },
      { PROD_CD: "SET0011", QTY: -7, PRICE: 12052 },
    ],
  },
  {
    ioDate: "2026-09-30",
    lines: [
      { PROD_CD: "U0001", QTY: -20, PRICE: 13369 },
      { PROD_CD: "U0002", QTY: -7, PRICE: 12031 },
      { PROD_CD: "U0009", QTY: -7, PRICE: 12861 },
      { PROD_CD: "U0006", QTY: -93, PRICE: 22563 },
      { PROD_CD: "U0010", QTY: -3, PRICE: 80000 },
      { PROD_CD: "SET0016", QTY: -41, PRICE: 12925 },
      { PROD_CD: "SET0017", QTY: -58, PRICE: 12271 },
      { PROD_CD: "SET0013", QTY: -47, PRICE: 12280 },
      { PROD_CD: "SET0011", QTY: -17, PRICE: 12316 },
    ],
  },
  {
    ioDate: "2026-10-31",
    lines: [
      { PROD_CD: "U0001", QTY: -24, PRICE: 13392 },
      { PROD_CD: "U0002", QTY: -5, PRICE: 12200 },
      { PROD_CD: "U0009", QTY: -10, PRICE: 14154 },
      { PROD_CD: "U0006", QTY: -45, PRICE: 23296 },
      { PROD_CD: "SET0016", QTY: -9, PRICE: 12838 },
      { PROD_CD: "SET0017", QTY: -32, PRICE: 12682 },
      { PROD_CD: "SET0013", QTY: -40, PRICE: 12320 },
      { PROD_CD: "SET0011", QTY: -22, PRICE: 12433 },
    ],
  },
  {
    ioDate: "2026-11-15",
    lines: [
      { PROD_CD: "U0001", QTY: -7, PRICE: 13409 },
      { PROD_CD: "U0002", QTY: -1, PRICE: 12200 },
      { PROD_CD: "U0009", QTY: -3, PRICE: 14318 },
      { PROD_CD: "U0006", QTY: -32, PRICE: 23225 },
      { PROD_CD: "SET0017", QTY: -17, PRICE: 12701 },
      { PROD_CD: "SET0013", QTY: -20, PRICE: 12345 },
      { PROD_CD: "SET0011", QTY: -10, PRICE: 12091 },
    ],
  },
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const monthIndex = Number(body?.monthIndex);
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex >= MONTHS.length) {
    return NextResponse.json({ error: "INVALID_MONTH_INDEX" }, { status: 400 });
  }

  const cust = CHANNEL_CUST["coupang_jcompany"];
  const whCd = CHANNEL_WH_CD["coupang_jcompany"];
  const month = MONTHS[monthIndex];

  const result = await registerEcountSale({
    cust,
    whCd,
    lines: month.lines,
    ioDate: toEcountIoDate(month.ioDate),
    groupAsOneSlip: true,
  });

  return NextResponse.json({ ioDate: month.ioDate, lines: month.lines, result });
}
