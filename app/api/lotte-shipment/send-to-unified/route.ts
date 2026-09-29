// app/api/lotte-shipment/send-to-unified/route.ts
//
// 체크된 미전송 롯데택배 건을 통합관리에 매칭해서 반영한다.
// 매칭 기준: 수취인명 + 연락처1 둘 다 정확히 일치하는 통합관리 행 1건.
// POST { ids: string[] } (운송장번호 배열)

import { NextResponse } from "next/server";
import { sendLotteShipmentsToUnified } from "@/api/lotte-shipment/_lib/lotteShipmentService";
import { getChangeHistoryActor } from "@/unified/change-history/serverChangeHistory";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const idsRaw = body?.ids;

  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const actor = await getChangeHistoryActor();
    const result = await sendLotteShipmentsToUnified(
      idsRaw.map((x: any) => String(x)),
      actor
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("POST /api/lotte-shipment/send-to-unified error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
