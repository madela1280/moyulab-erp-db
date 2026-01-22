import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function toInt(v: any, def: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}

async function ensureSwingTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_swing (
      id   SERIAL PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS device_swing_order (
      swing_id INT PRIMARY KEY REFERENCES device_swing(id) ON DELETE CASCADE,
      sort_key NUMERIC NOT NULL
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_device_swing_order_sort
    ON device_swing_order(sort_key, swing_id);
  `);

  await query(`
    INSERT INTO device_swing_order (swing_id, sort_key)
    SELECT s.id, (ROW_NUMBER() OVER (ORDER BY s.id)) * 1000
    FROM device_swing s
    WHERE NOT EXISTS (
      SELECT 1 FROM device_swing_order o WHERE o.swing_id = s.id
    );
  `);
}

/**
 * POST /api/devices/swing/insert
 * body: { count: number, beforeId: number|null, afterId: number|null }
 *
 * - beforeId/afterId 사이에 count개 삽입
 * - 둘 다 null이면 맨 뒤에 추가
 * - 반환: insertedRows [{id, sort_key}]
 */
export async function POST(req: Request) {
  try {
    await ensureSwingTables();

    const body = await req.json().catch(() => ({}));

    const count = Math.max(1, Math.min(5000, toInt(body?.count, 1)));
    const beforeId = body?.beforeId == null ? null : toInt(body.beforeId, 0);
    const afterId = body?.afterId == null ? null : toInt(body.afterId, 0);

    let beforeKey: number | null = null;
    let afterKey: number | null = null;

    if (beforeId) {
      const r = await query(`SELECT sort_key::numeric AS sort_key FROM device_swing_order WHERE swing_id=$1`, [
        beforeId,
      ]);
      beforeKey = r.rows[0]?.sort_key != null ? Number(r.rows[0].sort_key) : null;
    }

    if (afterId) {
      const r = await query(`SELECT sort_key::numeric AS sort_key FROM device_swing_order WHERE swing_id=$1`, [
        afterId,
      ]);
      afterKey = r.rows[0]?.sort_key != null ? Number(r.rows[0].sort_key) : null;
    }

    if (beforeKey == null && afterKey == null) {
      const maxR = await query(`SELECT COALESCE(MAX(sort_key), 0)::numeric AS max FROM device_swing_order`);
      const max = Number(maxR.rows[0]?.max ?? 0);

      const inserted: Array<{ id: number; sort_key: number }> = [];

      await query("BEGIN");
      try {
        for (let i = 0; i < count; i++) {
          const created = await query(`INSERT INTO device_swing (data) VALUES ($1) RETURNING id`, [{}]);
          const id = Number(created.rows[0]?.id);
          const sortKey = max + (i + 1) * 1000;

          await query(`INSERT INTO device_swing_order (swing_id, sort_key) VALUES ($1, $2)`, [id, sortKey]);

          inserted.push({ id, sort_key: sortKey });
        }

        await query("COMMIT");
      } catch (e) {
        await query("ROLLBACK");
        throw e;
      }

      return NextResponse.json({ ok: true, insertedRows: inserted });
    }

    if (beforeKey == null && afterKey != null) beforeKey = afterKey - 1000;
    if (afterKey == null && beforeKey != null) afterKey = beforeKey + 1000;

    const start = Number(beforeKey);
    const end = Number(afterKey);

    const step = (end - start) / (count + 1);

    const inserted: Array<{ id: number; sort_key: number }> = [];

    await query("BEGIN");
    try {
      for (let i = 0; i < count; i++) {
        const created = await query(`INSERT INTO device_swing (data) VALUES ($1) RETURNING id`, [{}]);
        const id = Number(created.rows[0]?.id);
        const sortKey = start + step * (i + 1);

        await query(`INSERT INTO device_swing_order (swing_id, sort_key) VALUES ($1, $2)`, [id, sortKey]);

        inserted.push({ id, sort_key: sortKey });
      }

      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }

    return NextResponse.json({ ok: true, insertedRows: inserted });
  } catch (e) {
    console.error("POST /api/devices/swing/insert error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}