// app/api/lotte-shipment/send-to-ecount/route.ts
//
// 체크된 건을 이카운트 매출로 전송 시도한다.
// 상품명 -> 이카운트 품목코드 매핑표가 아직 없어서, 지금 단계에서는 실제 전송 없이
// 전부 PRODUCT_NOT_MATCHED로 보류 처리한다(매핑표 추가되면 실제 SaveSale 호출로 교체 예정).
// POST { ids: string[] } (운송장번호 배열)

import { NextResponse } from "next/server";
import { sendLotteShipmentsToEcount } from "@/api/lotte-shipment/_lib/lotteShipmentService";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const idsRaw = body?.ids;

  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const result = await sendLotteShipmentsToEcount(idsRaw.map((x: any) => String(x)));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("POST /api/lotte-shipment/send-to-ecount error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
