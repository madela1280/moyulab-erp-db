import { NextResponse } from "next/server";

/**
 * DEPRECATED
 * - 집계 설정에서 "유축기 기종" 기능을 제거하면서 더 이상 사용하지 않음.
 * - 기존 클라이언트가 호출할 가능성을 고려해 410(Gone)으로 명확히 종료.
 */
export async function GET() {
  return NextResponse.json({ error: "GONE" }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: "GONE" }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: "GONE" }, { status: 410 });
}