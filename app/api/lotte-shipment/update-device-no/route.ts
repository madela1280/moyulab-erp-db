// app/api/lotte-shipment/update-device-no/route.ts
//
// 롯데택배 기기번호 수동 수정(RFID 오인식 등 보정용). 이미 통합관리로 전송된 건이면
// 그 unified 행의 기기번호도 같이 갱신한다.
// POST { invoiceNo: string, 기기번호: string }

import { NextResponse } from "next/server";
import { updateLotteShipmentDeviceNo } from "@/api/lotte-shipment/_lib/lotteShipmentService";
import { getChangeHistoryActor } from "@/unified/change-history/serverChangeHistory";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const invoiceNo = body?.invoiceNo;
  const 기기번호 = body?.기기번호;

  if (!invoiceNo || typeof invoiceNo !== "string" || typeof 기기번호 !== "string") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const actor = await getChangeHistoryActor();
    const result = await updateLotteShipmentDeviceNo(invoiceNo, 기기번호, actor);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/lotte-shipment/update-device-no error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
