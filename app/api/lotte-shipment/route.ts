// app/api/lotte-shipment/route.ts
//
// 롯데택배 조회 화면. GET=목록 조회, DELETE=체크된 건 삭제.

import { NextResponse } from "next/server";
import { listLotteShipments, deleteLotteShipments } from "@/api/lotte-shipment/_lib/lotteShipmentService";

export async function GET() {
  try {
    const rows = await listLotteShipments();
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    console.error("GET /api/lotte-shipment error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const idsRaw = body?.ids;

  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const result = await deleteLotteShipments(idsRaw.map((x: any) => String(x)));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("DELETE /api/lotte-shipment error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
