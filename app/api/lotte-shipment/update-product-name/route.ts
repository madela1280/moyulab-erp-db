// app/api/lotte-shipment/update-product-name/route.ts
//
// 롯데택배 상품명 수동 수정(이카운트 매칭 실패 건을 고쳐서 재전송할 수 있게).
// 이미 이카운트 전송 완료된 건(이카운트전표번호 있음)은 수정 불가.
// POST { invoiceNo: string, 상품명: string }

import { NextResponse } from "next/server";
import { updateLotteShipmentProductName } from "@/api/lotte-shipment/_lib/lotteShipmentService";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const invoiceNo = body?.invoiceNo;
  const 상품명 = body?.상품명;

  if (!invoiceNo || typeof invoiceNo !== "string" || typeof 상품명 !== "string") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const result = await updateLotteShipmentProductName(invoiceNo, 상품명);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/lotte-shipment/update-product-name error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
