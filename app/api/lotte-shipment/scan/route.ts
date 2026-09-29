// app/api/lotte-shipment/scan/route.ts
//
// PM84 스캔 화면 전용. 송장번호 1건 스캔 -> 스캔일시 기록 + (가능하면) 통합관리 자동 전송.
// POST { invoiceNo: string }

import { NextResponse } from "next/server";
import { scanLotteShipment } from "@/api/lotte-shipment/_lib/lotteShipmentService";
import { getChangeHistoryActor } from "@/unified/change-history/serverChangeHistory";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const invoiceNo = body?.invoiceNo;

  if (!invoiceNo || typeof invoiceNo !== "string") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const actor = await getChangeHistoryActor();
    const result = await scanLotteShipment(invoiceNo, actor);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("POST /api/lotte-shipment/scan error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
