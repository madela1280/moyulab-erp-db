import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function toInt(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function toNum(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

async function ensureRecovery1Tables() {
  await query(`
    CREATE TABLE IF NOT EXISTS recovery1 (
      id   SERIAL PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS recovery1_order (
      recovery1_id INT PRIMARY KEY REFERENCES recovery1(id) ON DELETE CASCADE,
      sort_key NUMERIC NOT NULL
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_recovery1_order_sort
    ON recovery1_order(sort_key, recovery1_id);
  `);

  // order 누락 보정
  await query(`
    INSERT INTO recovery1_order (recovery1_id, sort_key)
    SELECT r.id, (ROW_NUMBER() OVER (ORDER BY r.id)) * 1000
    FROM recovery1 r
    WHERE NOT EXISTS (
      SELECT 1 FROM recovery1_order o WHERE o.recovery1_id = r.id
    );
  `);
}

export async function GET(req: Request) {
  try {
    await ensureRecovery1Tables();

    const url = new URL(req.url);
    const sp = url.searchParams;

    if ((sp.get("meta") || "").toLowerCase() === "count") {
      const r = await query(`SELECT COUNT(*)::int AS count FROM recovery1_order`);
      return NextResponse.json({ count: Number(r.rows[0]?.count ?? 0) });
    }

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
        SELECT r.id, r.data, o.sort_key
        FROM recovery1 r
        JOIN recovery1_order o ON o.recovery1_id = r.id
        WHERE r.id = ANY($1::int[])
        ORDER BY o.sort_key ASC, r.id ASC
        `,
        [ids]
      );

      return NextResponse.json(r.rows);
    }

    const limitRaw = toInt(sp.get("limit"));
    const limit = limitRaw == null ? 500 : Math.max(1, Math.min(5000, limitRaw));

    const tail = sp.get("tail") === "1";
    const tailData = sp.get("tailData") === "1";

    const beforeSortKey = toNum(sp.get("beforeSortKey"));
    const beforeId = toInt(sp.get("beforeId"));
    const afterSortKey = toNum(sp.get("afterSortKey"));
    const afterId = toInt(sp.get("afterId"));

    // 파라미터 없이 호출되면 전체 반환(호환)
    const noParams = Array.from(sp.keys()).length === 0;
    if (noParams) {
      const r = await query(`
        SELECT r.id, r.data, o.sort_key
        FROM recovery1 r
        JOIN recovery1_order o ON o.recovery1_id = r.id
        ORDER BY o.sort_key ASC, r.id ASC
      `);
      return NextResponse.json(r.rows);
    }

    const totalR = await query(`SELECT COUNT(*)::int AS total FROM recovery1_order`);
    const total = Number(totalR.rows[0]?.total ?? 0);

    // tailData: 마지막 "데이터가 있는 행" 기준 tail
    if (tailData) {
      const cursorR = await query(
        `
        WITH last_data AS (
          SELECT o.sort_key, r.id
          FROM recovery1_order o
          JOIN recovery1 r ON r.id = o.recovery1_id
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_each_text(r.data) kv
            WHERE kv.value IS NOT NULL AND kv.value <> ''
          )
          ORDER BY o.sort_key DESC, r.id DESC
          LIMIT 1
        ),
        last_any AS (
          SELECT o.sort_key, o.recovery1_id AS id
          FROM recovery1_order o
          ORDER BY o.sort_key DESC, o.recovery1_id DESC
          LIMIT 1
        )
        SELECT
          COALESCE((SELECT sort_key FROM last_data), (SELECT sort_key FROM last_any), 0) AS sort_key,
          COALESCE((SELECT id FROM last_data), (SELECT id FROM last_any), 0) AS id
        `
      );

      const cursorSortKey = cursorR.rows[0]?.sort_key ?? 0;
      const cursorId = Number(cursorR.rows[0]?.id ?? 0);

      const pageR = await query(
        `
        SELECT * FROM (
          SELECT r.id, r.data, o.sort_key
          FROM recovery1 r
          JOIN recovery1_order o ON o.recovery1_id = r.id
          WHERE (o.sort_key, r.id) <= ($1::numeric, $2::int)
          ORDER BY o.sort_key DESC, r.id DESC
          LIMIT $3
        ) t
        ORDER BY t.sort_key ASC, t.id ASC
        `,
        [cursorSortKey, cursorId, limit]
      );

      const rows = pageR.rows;

      const posR = await query(
        `
        SELECT COUNT(*)::int AS pos
        FROM recovery1_order o
        WHERE (o.sort_key, o.recovery1_id) <= ($1::numeric, $2::int)
        `,
        [cursorSortKey, cursorId]
      );
      const pos = Number(posR.rows[0]?.pos ?? rows.length);
      const baseIndex = Math.max(1, pos - rows.length + 1);

      return NextResponse.json({ rows, total, baseIndex });
    }

    // tail: 진짜 마지막 N개
    if (tail) {
      const r = await query(
        `
        SELECT * FROM (
          SELECT r.id, r.data, o.sort_key
          FROM recovery1 r
          JOIN recovery1_order o ON o.recovery1_id = r.id
          ORDER BY o.sort_key DESC, r.id DESC
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

    // prev page
    if (beforeSortKey != null && beforeId != null) {
      const r = await query(
        `
        WITH page AS (
          SELECT r.id, r.data, o.sort_key
          FROM recovery1 r
          JOIN recovery1_order o ON o.recovery1_id = r.id
          WHERE (o.sort_key, r.id) < ($1::numeric, $2::int)
          ORDER BY o.sort_key DESC, r.id DESC
          LIMIT $3
        ),
        page2 AS (
          SELECT * FROM page ORDER BY sort_key ASC, id ASC
        ),
        first_row AS (
          SELECT sort_key, id FROM page2 LIMIT 1
        ),
        base AS (
          SELECT
            CASE
              WHEN (SELECT COUNT(*) FROM page2) = 0 THEN NULL
              ELSE (
                SELECT COUNT(*)::int
                FROM recovery1_order o
                WHERE (o.sort_key, o.recovery1_id) < ((SELECT sort_key FROM first_row), (SELECT id FROM first_row))
              ) + 1
            END AS base_index
        )
        SELECT
          (SELECT json_agg(page2 ORDER BY sort_key ASC, id ASC) FROM page2) AS rows_json,
          (SELECT base_index FROM base) AS base_index
        `,
        [beforeSortKey, beforeId, limit]
      );

      const rows = (r.rows[0]?.rows_json ?? []) as any[];
      const baseIndex = Number(r.rows[0]?.base_index ?? 1);
      return NextResponse.json({ rows, total, baseIndex });
    }

    // next page
    if (afterSortKey != null && afterId != null) {
      const r = await query(
        `
        WITH page AS (
          SELECT r.id, r.data, o.sort_key
          FROM recovery1 r
          JOIN recovery1_order o ON o.recovery1_id = r.id
          WHERE (o.sort_key, r.id) > ($1::numeric, $2::int)
          ORDER BY o.sort_key ASC, r.id ASC
          LIMIT $3
        ),
        first_row AS (
          SELECT sort_key, id FROM page LIMIT 1
        ),
        base AS (
          SELECT
            CASE
              WHEN (SELECT COUNT(*) FROM page) = 0 THEN NULL
              ELSE (
                SELECT COUNT(*)::int
                FROM recovery1_order o
                WHERE (o.sort_key, o.recovery1_id) < ((SELECT sort_key FROM first_row), (SELECT id FROM first_row))
              ) + 1
            END AS base_index
        )
        SELECT
          (SELECT json_agg(page ORDER BY sort_key ASC, id ASC) FROM page) AS rows_json,
          (SELECT base_index FROM base) AS base_index
        `,
        [afterSortKey, afterId, limit]
      );

      const rows = (r.rows[0]?.rows_json ?? []) as any[];
      const baseIndex = Number(r.rows[0]?.base_index ?? 1);
      return NextResponse.json({ rows, total, baseIndex });
    }

    // default: limit 앞에서부터
    const r = await query(
      `
      WITH page AS (
        SELECT r.id, r.data, o.sort_key
        FROM recovery1 r
        JOIN recovery1_order o ON o.recovery1_id = r.id
        ORDER BY o.sort_key ASC, r.id ASC
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
    console.error("GET /api/recovery1 error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureRecovery1Tables();

    const body = (await req.json().catch(() => null)) as any;
    const data: Record<string, any> =
      body && typeof body === "object" && !Array.isArray(body) ? { ...body } : {};

    const r = await query(`INSERT INTO recovery1 (data) VALUES ($1) RETURNING id, data`, [data]);
    const created = r.rows[0];

    const maxR = await query(`SELECT COALESCE(MAX(sort_key), 0) AS max FROM recovery1_order`);
    const max = Number(maxR.rows[0]?.max ?? 0);
    const nextKey = max + 1000;

    await query(
      `
      INSERT INTO recovery1_order (recovery1_id, sort_key)
      VALUES ($1, $2)
      ON CONFLICT (recovery1_id) DO NOTHING
      `,
      [created.id, nextKey]
    );

    return NextResponse.json(created);
  } catch (e) {
    console.error("POST /api/recovery1 error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}