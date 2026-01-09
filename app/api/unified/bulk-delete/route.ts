import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * POST /api/unified/bulk-delete
 * body:
 * {
 *   ids: number[]
 * }
 *
 * - 여러 행 삭제를 1쿼리로 처리(원자적으로 실행)
 */
export async function POST(req: Request) {
  const body = await req.json();

  const idsRaw = body?.ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "ids array is required" },
      { status: 400 }
    );
  }

  const ids = idsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0);
  if (ids.length !== idsRaw.length) {
    return NextResponse.json(
      { error: "INVALID_IDS", message: "ids must be positive numbers" },
      { status: 400 }
    );
  }

  const r = await query(
    `DELETE FROM unified WHERE id = ANY($1::int[]) RETURNING id`,
    [ids]
  );

  return NextResponse.json({
    ok: true,
    deletedCount: r.rows.length,
    deletedIds: r.rows.map((x: any) => x.id),
  });
}