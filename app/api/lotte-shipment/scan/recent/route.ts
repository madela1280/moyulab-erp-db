// app/api/lotte-shipment/scan/recent/route.ts
//
// PM84 스캔 화면 전용. "최근 로그" 표를 채우기 위한 조회 API. 최근 스캔된 송장들을
// 운송장번호/수하인명/기기번호/스캔일시와 함께 돌려준다.
// PM84 Chrome이 백그라운드 탭을 새로고침시켜 화면 안 기록이 사라지는 문제가 있어서,
// 화면이 열릴 때마다(그리고 주기적으로) 여기서 다시 불러와 복구한다.

import { NextResponse } from "next/server";
import { listRecentScans } from "@/api/lotte-shipment/_lib/lotteShipmentService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await listRecentScans(30);
    return NextResponse.json({ rows });
  } catch (e) {
    console.error("GET /api/lotte-shipment/scan/recent error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
