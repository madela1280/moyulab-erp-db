import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * POST /api/recovery1/insert
 * body: { count: number, beforeId?: number|null, afterId?: number|null }
 *
 * unified/insert 패턴 동일(정렬 테이블만 recovery1_order)
 */
export async function POST(req: Request) {
  const body = await req.json();

  const count = Math.floor(Number(body?.count ?? 0));
  const beforeId =
    body?.beforeId === null || body?.beforeId === undefined
      ? null
      : Number(body.beforeId);
  const afterId =
    body?.afterId === null || body?.afterId === undefined
      ? null
      : Number(body.afterId);

  if (!Number.isFinite(count) || count <= 0 || count > 5000) {
    return NextResponse.json(
      { error: "INVALID_COUNT", message: "count must be 1..5000" },
      { status: 400 }
    );
  }
  if (beforeId !== null && (!Number.isFinite(beforeId) || beforeId <= 0)) {
    return NextResponse.json({ error: "INVALID_BEFORE_ID" }, { status: 400 });
  }
  if (afterId !== null && (!Number.isFinite(afterId) || afterId <= 0)) {
    return NextResponse.json({ error: "INVALID_AFTER_ID" }, { status: 400 });
  }

  // 존재 체크
  if (beforeId !== null) {
    const r = await query(
      `SELECT 1 FROM recovery1_order WHERE recovery1_id=$1 LIMIT 1`,
      [beforeId]
    );
    if (!r.rows.length) {
      return NextResponse.json(
        { error: "BEFORE_NOT_FOUND" },
        { status: 404 }
      );
    }
  }
  if (afterId !== null) {
    const r = await query(
      `SELECT 1 FROM recovery1_order WHERE recovery1_id=$1 LIMIT 1`,
      [afterId]
    );
    if (!r.rows.length) {
      return NextResponse.json(
        { error: "AFTER_NOT_FOUND" },
        { status: 404 }
      );
    }
  }

  const sql = `
    WITH
      params AS (
        SELECT
          $1::int AS cnt,
          $2::int AS before_id,
          $3::int AS after_id
      ),
      keys0 AS (
        SELECT
          (SELECT sort_key FROM recovery1_order WHERE recovery1_id = (SELECT before_id FROM params)) AS before_key,
          (SELECT sort_key FROM recovery1_order WHERE recovery1_id = (SELECT after_id FROM params)) AS after_key
      ),
      need_rebalance AS (
        SELECT
          (SELECT cnt FROM params) AS cnt,
          (SELECT before_id FROM params) AS before_id,
          (SELECT after_id FROM params) AS after_id,
          COALESCE((SELECT after_key FROM keys0), 0) - COALESCE((SELECT before_key FROM keys0), 0) AS gap
      ),
      rebalance AS (
        UPDATE recovery1_order o
        SET sort_key = r.rn * 1000
        FROM (
          SELECT recovery1_id, ROW_NUMBER() OVER (ORDER BY sort_key ASC, recovery1_id ASC) AS rn
          FROM recovery1_order
        ) r,
        need_rebalance n
        WHERE o.recovery1_id = r.recovery1_id
          AND n.before_id IS NOT NULL
          AND n.after_id IS NOT NULL
          AND n.gap <= (n.cnt + 1)
        RETURNING 1
      ),
      keys AS (
        SELECT
          (SELECT sort_key FROM recovery1_order WHERE recovery1_id = (SELECT before_id FROM params)) AS before_key,
          (SELECT sort_key FROM recovery1_order WHERE recovery1_id = (SELECT after_id FROM params)) AS after_key,
          (SELECT COALESCE(MAX(sort_key), 0) FROM recovery1_order) AS max_key
      ),
      ins AS (
        INSERT INTO recovery1 (data)
        SELECT '{}'::jsonb
        FROM generate_series(1, (SELECT cnt FROM params))
        RETURNING id
      ),
      numbered AS (
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY id ASC) AS rn,
          (SELECT cnt FROM params) AS cnt
        FROM ins
      ),
      calc AS (
        SELECT
          n.id,
          CASE
            WHEN (SELECT after_id FROM params) IS NULL THEN
              (SELECT max_key FROM keys) + (n.rn * 1000)

            WHEN (SELECT before_id FROM params) IS NULL THEN
              (SELECT (SELECT sort_key FROM recovery1_order WHERE recovery1_id = (SELECT after_id FROM params)))
              - (((n.cnt - n.rn + 1)::numeric) * 1000)

            ELSE
              (SELECT before_key FROM keys)
              + (
                  ((SELECT after_key FROM keys) - (SELECT before_key FROM keys))
                  * (n.rn::numeric)
                  / (n.cnt::numeric + 1)
                )
          END AS sort_key
        FROM numbered n
      ),
      ins_order AS (
        INSERT INTO recovery1_order (recovery1_id, sort_key)
        SELECT id, sort_key FROM calc
        RETURNING recovery1_id, sort_key
      )
    SELECT
      (SELECT COUNT(*) FROM ins) AS inserted_count,
      (SELECT json_agg(recovery1_id ORDER BY sort_key ASC) FROM ins_order) AS inserted_ids,
      (SELECT json_agg(json_build_object('id', recovery1_id, 'sort_key', sort_key) ORDER BY sort_key ASC) FROM ins_order) AS inserted_rows
  `;

  const r = await query(sql, [count, beforeId, afterId]);
  const row = r.rows[0] ?? {};

  return NextResponse.json({
    ok: true,
    insertedCount: Number(row.inserted_count ?? 0),
    insertedIds: row.inserted_ids ?? [],
    insertedRows: row.inserted_rows ?? [],
  });
}