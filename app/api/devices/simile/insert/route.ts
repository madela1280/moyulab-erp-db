import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function toInt(v: any, def: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}

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

  // order 누락 보정
  await query(`
    INSERT INTO device_simile_order (simile_id, sort_key)
    SELECT s.id, (ROW_NUMBER() OVER (ORDER BY s.id)) * 1000
    FROM device_simile s
    WHERE NOT EXISTS (
      SELECT 1 FROM device_simile_order o WHERE o.simile_id = s.id
    );
  `);
}

/**
 * POST /api/devices/simile/insert
 * body: { count: number, beforeId: number|null, afterId: number|null }
 */
export async function POST(req: Request) {
  try {
    await ensureSimileTables();

    const body = await req.json().catch(() => ({}));

    const count = Math.max(1, Math.min(5000, toInt(body?.count, 1)));
    const beforeId = body?.beforeId == null ? null : toInt(body.beforeId, 0);
    const afterId = body?.afterId == null ? null : toInt(body.afterId, 0);

    let beforeKey: number | null = null;
    let afterKey: number | null = null;

    if (beforeId) {
      const r = await query(
        `SELECT sort_key::numeric AS sort_key FROM device_simile_order WHERE simile_id=$1`,
        [beforeId]
      );
      beforeKey = r.rows[0]?.sort_key != null ? Number(r.rows[0].sort_key) : null;
    }

    if (afterId) {
      const r = await query(
        `SELECT sort_key::numeric AS sort_key FROM device_simile_order WHERE simile_id=$1`,
        [afterId]
      );
      afterKey = r.rows[0]?.sort_key != null ? Number(r.rows[0].sort_key) : null;
    }

    // 둘 다 없으면 tail append
    if (beforeKey == null && afterKey == null) {
      const maxR = await query(
        `SELECT COALESCE(MAX(sort_key), 0)::numeric AS max FROM device_simile_order`
      );
      const max = Number(maxR.rows[0]?.max ?? 0);

      const inserted: Array<{ id: number; sort_key: number }> = [];

      await query("BEGIN");
      try {
        for (let i = 0; i < count; i++) {
          const created = await query(`INSERT INTO device_simile (data) VALUES ($1) RETURNING id`, [
            {},
          ]);
          const id = Number(created.rows[0]?.id);
          const sortKey = max + (i + 1) * 1000;

          await query(`INSERT INTO device_simile_order (simile_id, sort_key) VALUES ($1, $2)`, [
            id,
            sortKey,
          ]);

          inserted.push({ id, sort_key: sortKey });
        }

        await query("COMMIT");
      } catch (e) {
        await query("ROLLBACK");
        throw e;
      }

      return NextResponse.json({ ok: true, insertedRows: inserted });
    }

    // 한쪽만 있으면 범위 생성
    if (beforeKey == null && afterKey != null) beforeKey = afterKey - 1000;
    if (afterKey == null && beforeKey != null) afterKey = beforeKey + 1000;

    const start = Number(beforeKey);
    const end = Number(afterKey);

    const step = (end - start) / (count + 1);

    const inserted: Array<{ id: number; sort_key: number }> = [];

    await query("BEGIN");
    try {
      for (let i = 0; i < count; i++) {
        const created = await query(`INSERT INTO device_simile (data) VALUES ($1) RETURNING id`, [
          {},
        ]);
        const id = Number(created.rows[0]?.id);
        const sortKey = start + step * (i + 1);

        await query(`INSERT INTO device_simile_order (simile_id, sort_key) VALUES ($1, $2)`, [
          id,
          sortKey,
        ]);

        inserted.push({ id, sort_key: sortKey });
      }

      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }

    return NextResponse.json({ ok: true, insertedRows: inserted });
  } catch (e) {
    console.error("POST /api/devices/simile/insert error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}