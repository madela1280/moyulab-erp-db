import { NextResponse } from "next/server";
import { query } from "@/lib/db";

async function ensureSimileTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_simile (
      id   SERIAL PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS device_simile_order (
      simile_id INT PRIMARY KEY REFERENCES device_simile(id) ON DELETE CASCADE,
      sort_key  NUMERIC NOT NULL
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_device_simile_order_sort
    ON device_simile_order(sort_key, simile_id);
  `);
}

/**
 * POST /api/devices/simile/bulk-delete
 * body: { ids: number[] }
 */
export async function POST(req: Request) {
  try {
    await ensureSimileTables();

    const body = await req.json().catch(() => ({}));

    const idsRaw = body?.ids;
    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "ids array is required" },
        { status: 400 }
      );
    }

    const ids = idsRaw
      .map((x: any) => Number(x))
      .filter((n: number) => Number.isFinite(n) && n > 0);

    if (ids.length !== idsRaw.length) {
      return NextResponse.json(
        { error: "INVALID_IDS", message: "ids must be positive numbers" },
        { status: 400 }
      );
    }

    const r = await query(`DELETE FROM device_simile WHERE id = ANY($1::int[]) RETURNING id`, [
      ids,
    ]);

    return NextResponse.json({
      ok: true,
      deletedCount: r.rows.length,
      deletedIds: r.rows.map((x: any) => x.id),
    });
  } catch (e) {
    console.error("POST /api/devices/simile/bulk-delete error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}