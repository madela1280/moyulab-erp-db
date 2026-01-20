import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * POST /api/devices/symphony/bulk-patch
 * body:
 * {
 *   updates: Array<{ id: number, patch: Record<string, any> }>
 * }
 *
 * - patch는 merge로 반영 (null도 그대로 저장)
 * - 단순/안전 우선: 트랜잭션으로 순차 업데이트(나중에 성능 필요하면 1쿼리로 최적화 가능)
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const updatesRaw = body?.updates;

  if (!Array.isArray(updatesRaw) || updatesRaw.length === 0) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "updates array is required" },
      { status: 400 }
    );
  }

  const updates = updatesRaw.map((u: any) => ({
    id: Number(u?.id),
    patch: u?.patch,
  }));

  for (const u of updates) {
    if (!Number.isFinite(u.id) || u.id <= 0) {
      return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
    }
    if (!u.patch || typeof u.patch !== "object" || Array.isArray(u.patch)) {
      return NextResponse.json({ error: "INVALID_PATCH" }, { status: 400 });
    }
  }

  const updatedIds: number[] = [];

  await query("BEGIN");
  try {
    for (const u of updates) {
      const old = await query(`SELECT data FROM device_symphony WHERE id=$1`, [u.id]);
      const source = old.rows[0]?.data || {};

      const merged: Record<string, any> = { ...source };
      for (const key in u.patch) {
        merged[key] = (u.patch as any)[key]; // null 포함
      }

      const r = await query(
        `UPDATE device_symphony SET data=$1 WHERE id=$2 RETURNING id`,
        [merged, u.id]
      );

      if (r.rows.length) updatedIds.push(Number(r.rows[0].id));
    }

    await query("COMMIT");
  } catch (e) {
    await query("ROLLBACK");
    console.error("bulk-patch failed:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updatedCount: updatedIds.length, updatedIds });
}