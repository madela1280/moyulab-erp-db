// app/api/unified/bulk-delete/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * POST /api/unified/bulk-delete
 * body:
 * {
 *   ids: number[]
 * }
 *
 * - unified 삭제 + unified_order 정리를 "한 번의 SQL"로 원자적으로 처리
 * - unified_order를 먼저 삭제해서 FK가 있어도 안전하게 동작
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
      DELETE FROM unified_order
      WHERE unified_id = ANY($1::int[])
      RETURNING unified_id
    ),
    del_unified AS (
      DELETE FROM unified
      WHERE id = ANY($1::int[])
      RETURNING id
    )
    SELECT
      (SELECT COUNT(*)::int FROM del_unified) AS deleted_count,
      COALESCE((SELECT json_agg(id ORDER BY id) FROM del_unified), '[]'::json) AS deleted_ids
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