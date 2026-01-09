import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * POST /api/unified/bulk-patch
 * body:
 * {
 *   updates: Array<{ id: number, patch?: Record<string, any>, data?: Record<string, any> }>
 * }
 *
 * - patch/data는 "merge"로 반영됨 (기존 PATCH와 동일하게 null도 그대로 저장)
 * - 한 번의 UPDATE 쿼리로 처리
 */
export async function POST(req: Request) {
  const body = await req.json();

  const updatesRaw = body?.updates;
  if (!Array.isArray(updatesRaw) || updatesRaw.length === 0) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "updates array is required" },
      { status: 400 }
    );
  }

  // 정규화 (patch / data 둘 다 허용)
  const updates = updatesRaw.map((u: any) => {
    const id = Number(u?.id);
    const patch = u?.patch ?? u?.data;
    return { id, patch };
  });

  for (const u of updates) {
    if (!Number.isFinite(u.id) || u.id <= 0) {
      return NextResponse.json(
        { error: "INVALID_ID", message: "Invalid id in updates" },
        { status: 400 }
      );
    }
    if (!u.patch || typeof u.patch !== "object" || Array.isArray(u.patch)) {
      return NextResponse.json(
        { error: "INVALID_PATCH", message: "patch/data object is required" },
        { status: 400 }
      );
    }
  }

  // jsonb merge: data = data || patch
  // patch에 null이 들어오면 해당 key를 null로 저장 (기존 PATCH와 동일)
  const sql = `
    WITH v AS (
      SELECT
        (x->>'id')::int AS id,
        x->'patch' AS patch
      FROM jsonb_array_elements($1::jsonb) AS x
    )
    UPDATE unified u
    SET data = u.data || v.patch
    FROM v
    WHERE u.id = v.id
    RETURNING u.id, u.data
  `;

  const r = await query(sql, [JSON.stringify(updates)]);

  return NextResponse.json({
    ok: true,
    updatedCount: r.rows.length,
    rows: r.rows,
  });
}