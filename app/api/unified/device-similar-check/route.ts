// app/api/unified/device-similar-check/route.ts
//
// 통합관리 셀 직접입력(기기번호) 시 화면에 경고만 띄우기 위한 읽기 전용 조회.
// - 저장은 sync-engine.ts의 syncPatch(→ /api/unified/[id])가 그대로 담당하며, 이 API는 그 흐름과 무관.
// GET /api/unified/device-similar-check?no=<기기번호>

import { NextResponse } from "next/server";
import { checkDeviceNoStatus } from "@/api/unified/_lib/deviceSimilarMatch";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const no = searchParams.get("no") ?? "";

  const result = await checkDeviceNoStatus(no);
  return NextResponse.json(result);
}
