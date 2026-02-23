import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * POST /api/recovery1/bulk-delete
 * body: { ids: number[] }
 *
 * - recovery1 삭제 + recovery1_order 정리를 한 번의 SQL로 처리
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const idsRaw = body?.ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "ids array is required" },
      { status: 400 }
    );
  }

  const ids = idsRaw
    .map((x: any) => Number(x))
    .filter((n: number) => Number.isFinite(n) && n > 0)
    .map((n: number) => Math.floor(n));

  if (ids.length !== idsRaw.length) {
    return NextResponse.json(
      { error: "INVALID_IDS", message: "ids must be positive numbers" },
      { status: 400 }
    );
  }

  const sql = `
    WITH del_order AS (
      DELETE FROM recovery1_order
      WHERE recovery1_id = ANY($1::int[])
      RETURNING recovery1_id
    ),
    del_rows AS (
      DELETE FROM recovery1
      WHERE id = ANY($1::int[])
      RETURNING id
    )
    SELECT
      (SELECT COUNT(*)::int FROM del_rows) AS deleted_count,
      COALESCE((SELECT json_agg(id ORDER BY id) FROM del_rows), '[]'::json) AS deleted_ids
  `;

  const r = await query(sql, [ids]);
  const row = r.rows?.[0] ?? {};

  const deletedCount = Number(row?.deleted_count ?? 0);

  let deletedIds: number[] = [];
  const raw = row?.deleted_ids;

  if (Array.isArray(raw)) {
    deletedIds = raw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n));
  } else if (typeof raw === "string") {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        deletedIds = arr.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n));
      }
    } catch {
      deletedIds = [];
    }
  }

  return NextResponse.json({
    ok: true,
    deletedCount,
    deletedIds,
  });
}