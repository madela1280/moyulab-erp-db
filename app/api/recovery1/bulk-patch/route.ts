import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function isPlainObject(v: any) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * POST /api/recovery1/bulk-patch
 * body: { updates: Array<{ id:number, patch: Record<string, any> }> }
 *
 * - jsonb merge(원자적): data = COALESCE(data,'{}') || patch
 * - null은 그대로 저장(삭제)
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const updatesRaw = body?.updates;
  if (!Array.isArray(updatesRaw) || updatesRaw.length === 0) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "updates array is required" },
      { status: 400 }
    );
  }

  const updates = updatesRaw.map((u: any) => ({
    id: Number(u?.id),
    patch: u?.patch ?? u?.data,
  }));

  for (const u of updates) {
    if (!Number.isFinite(u.id) || u.id <= 0) {
      return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
    }
    if (!isPlainObject(u.patch)) {
      return NextResponse.json({ error: "INVALID_PATCH" }, { status: 400 });
    }
  }

  const sql = `
    WITH v AS (
      SELECT
        (x->>'id')::int AS id,
        x->'patch' AS patch
      FROM jsonb_array_elements($1::jsonb) AS x
    )
    UPDATE recovery1 r
    SET data = COALESCE(r.data, '{}'::jsonb) || COALESCE(v.patch, '{}'::jsonb)
    FROM v
    WHERE r.id = v.id
    RETURNING r.id, r.data
  `;

  const r = await query(sql, [JSON.stringify(updates)]);

  return NextResponse.json({
    ok: true,
    updatedCount: r.rows.length,
    rows: r.rows,
  });
}