// app/api/lotte-shipment/rfid/route.ts
//
// PM84+RF88 전용 중계 앱(별도 안드로이드 앱) 전용 API.
// RF88 상단 트리거로 RFID 태그를 읽으면, "가장 최근에 스캔한 송장"에 기기번호로 등록한다.
// POST { tagId: string }
//
// 인증: 헤더 x-rfid-bridge-key 가 RFID_BRIDGE_API_KEY 환경변수와 일치해야 한다.
// (브라우저 로그인 쿠키가 없는 네이티브 앱 호출이라 별도 API 키 사용 — CLAUDE.md 22장과 같은 패턴)

import { NextRequest, NextResponse } from "next/server";
import { registerRfidTagToLatestScan } from "@/api/lotte-shipment/_lib/lotteShipmentService";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const expected = String(process.env.RFID_BRIDGE_API_KEY || "").trim();
  if (!expected) return false; // 키 미설정 시 기본 거부(안전 우선)

  const provided = String(req.headers.get("x-rfid-bridge-key") || "").trim();
  return !!provided && provided === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const tagId = body?.tagId;

  if (!tagId || typeof tagId !== "string") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const result = await registerRfidTagToLatestScan(tagId, { username: null, name: "RFID 중계 앱" });
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason }, { status: 404 });
    }
    return NextResponse.json({ ok: true, invoiceNo: result.invoiceNo, sendStatus: result.sendStatus });
  } catch (e) {
    console.error("POST /api/lotte-shipment/rfid error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
