// app/api/lotte-shipment/scan/device-no/route.ts
//
// PM84 스캔 화면 전용. 방금 스캔한 송장의 기기번호가 등록됐는지 확인하는 조회 API.
// GET ?invoiceNo=...
// RFID 태그는 별도 기기(RF88+중계 앱)에서 비동기로 등록되므로, 스캔 화면이 짧은 간격으로
// 이 API를 불러 폴링한다.

import { NextRequest, NextResponse } from "next/server";
import { getDeviceNoForInvoice } from "@/api/lotte-shipment/_lib/lotteShipmentService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const invoiceNo = req.nextUrl.searchParams.get("invoiceNo");
  if (!invoiceNo) {
    return NextResponse.json({ error: "INVALID_QUERY" }, { status: 400 });
  }

  try {
    const deviceNo = await getDeviceNoForInvoice(invoiceNo);
    return NextResponse.json({ deviceNo });
  } catch (e) {
    console.error("GET /api/lotte-shipment/scan/device-no error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
