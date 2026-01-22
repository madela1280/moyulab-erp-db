import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function toInt(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

async function ensureSwingMaxiTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_swing_maxi (
      id   SERIAL PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS device_swing_maxi_order (
      swing_maxi_id INT PRIMARY KEY REFERENCES device_swing_maxi(id) ON DELETE CASCADE,
      sort_key      NUMERIC NOT NULL
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_device_swing_maxi_order_sort
    ON device_swing_maxi_order(sort_key, swing_maxi_id);
  `);

  // order 누락 보정
  await query(`
    INSERT INTO device_swing_maxi_order (swing_maxi_id, sort_key)
    SELECT s.id, (ROW_NUMBER() OVER (ORDER BY s.id)) * 1000
    FROM device_swing_maxi s
    WHERE NOT EXISTS (
      SELECT 1 FROM device_swing_maxi_order o WHERE o.swing_maxi_id = s.id
    );
  `);
}

export async function GET(req: Request) {
  try {
    await ensureSwingMaxiTables();

    const url = new URL(req.url);
    const sp = url.searchParams;

    // meta=count : 전체 개수만
    if ((sp.get("meta") || "").toLowerCase() === "count") {
      const r = await query(`SELECT COUNT(*)::int AS count FROM device_swing_maxi_order`);
      return NextResponse.json({ count: Number(r.rows[0]?.count ?? 0) });
    }

    // ids=1,2,3 : 부분 갱신용
    const idsParam = sp.get("ids");
    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.floor(n));

      if (!ids.length) return NextResponse.json([]);

      const r = await query(
        `
        SELECT s.id, s.data, o.sort_key
        FROM device_swing_maxi s
        JOIN device_swing_maxi_order o ON o.swing_maxi_id = s.id
        WHERE s.id = ANY($1::int[])
        ORDER BY o.sort_key ASC, s.id ASC
        `,
        [ids]
      );

      return NextResponse.json(r.rows);
    }

    const limitRaw = toInt(sp.get("limit"));
    const limit = limitRaw == null ? 500 : Math.max(1, Math.min(5000, limitRaw));

    const tailData = sp.get("tailData") === "1";
    const tail = sp.get("tail") === "1";

    // 파라미터 없이 호출되면 전체(호환/디버그용)
    const noParams = Array.from(sp.keys()).length === 0;
    if (noParams) {
      const r = await query(`
        SELECT s.id, s.data, o.sort_key
        FROM device_swing_maxi s
        JOIN device_swing_maxi_order o ON o.swing_maxi_id = s.id
        ORDER BY o.sort_key ASC, s.id ASC
      `);
      return NextResponse.json(r.rows);
    }

    const totalR = await query(`SELECT COUNT(*)::int AS total FROM device_swing_maxi_order`);
    const total = Number(totalR.rows[0]?.total ?? 0);

    // tailData=1 : 마지막 데이터 근처 로드
    if (tailData || tail) {
      const r = await query(
        `
        SELECT * FROM (
          SELECT s.id, s.data, o.sort_key
          FROM device_swing_maxi s
          JOIN device_swing_maxi_order o ON o.swing_maxi_id = s.id
          ORDER BY o.sort_key DESC, s.id DESC
          LIMIT $1
        ) t
        ORDER BY t.sort_key ASC, t.id ASC
        `,
        [limit]
      );

      const rows = r.rows;
      const baseIndex = Math.max(1, total - rows.length + 1);
      return NextResponse.json({ rows, total, baseIndex });
    }

    // 기본: limit만 주면 앞에서부터 limit개
    const r = await query(
      `
      WITH page AS (
        SELECT s.id, s.data, o.sort_key
        FROM device_swing_maxi s
        JOIN device_swing_maxi_order o ON o.swing_maxi_id = s.id
        ORDER BY o.sort_key ASC, s.id ASC
        LIMIT $1
      )
      SELECT json_agg(page ORDER BY sort_key ASC, id ASC) AS rows_json
      FROM page
      `,
      [limit]
    );

    const rows = (r.rows[0]?.rows_json ?? []) as any[];
    return NextResponse.json({ rows, total, baseIndex: 1 });
  } catch (e) {
    console.error("GET /api/devices/swingMaxi error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSwingMaxiTables();

    const body = await req.json().catch(() => ({}));

    const r = await query(
      `INSERT INTO device_swing_maxi (data) VALUES ($1) RETURNING id, data`,
      [body ?? {}]
    );
    const created = r.rows[0];

    const maxR = await query(
      `SELECT COALESCE(MAX(sort_key), 0) AS max FROM device_swing_maxi_order`
    );
    const max = Number(maxR.rows[0]?.max ?? 0);
    const nextKey = max + 1000;

    await query(
      `
      INSERT INTO device_swing_maxi_order (swing_maxi_id, sort_key)
      VALUES ($1, $2)
      ON CONFLICT (swing_maxi_id) DO NOTHING
      `,
      [created.id, nextKey]
    );

    return NextResponse.json(created);
  } catch (e) {
    console.error("POST /api/devices/swingMaxi error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}