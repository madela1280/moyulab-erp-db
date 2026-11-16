// app/api/market-sales/cleanup-rg-snapshot-table/route.ts
//
// 일회성 정리 전용 — 폐기된 로켓그로스 순판매수량 스냅샷 기능이 만든 빈 테이블 삭제.
// 사용 후 이 파일 자체를 삭제할 것(DATABASE_URL을 셸에서 직접 못 읽어서 이 경로로 처리).
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST() {
  await query(`DROP TABLE IF EXISTS market_sales_rg_sales_count_snapshot`);
  return NextResponse.json({ ok: true });
}
