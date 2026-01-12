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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  // meta=count : 전체 개수만
  if ((sp.get("meta") || "").toLowerCase() === "count") {
    const r = await query(`SELECT COUNT(*)::int AS count FROM unified`);
    return NextResponse.json({ count: Number(r.rows[0]?.count ?? 0) });
  }

  const limitRaw = toInt(sp.get("limit"));
  const limit = limitRaw == null ? 500 : Math.max(1, Math.min(5000, limitRaw));

  const tail = sp.get("tail") === "1";

  // sort_key는 소수 가능 → numeric으로 처리해야 cursor 페이징이 안 꼬임
  const beforeSortKey = toNum(sp.get("beforeSortKey"));
  const beforeId = toInt(sp.get("beforeId"));
  const afterSortKey = toNum(sp.get("afterSortKey"));
  const afterId = toInt(sp.get("afterId"));

  // 기존 호환: 파라미터 없이 호출되면 예전처럼 "전체" 반환
  const noParams = Array.from(sp.keys()).length === 0;
  if (noParams) {
    const r = await query(`
      SELECT u.id, u.data, o.sort_key
      FROM unified u
      JOIN unified_order o ON o.unified_id = u.id
      ORDER BY o.sort_key ASC, u.id ASC
    `);
    return NextResponse.json(r.rows);
  }

  // total
  const totalR = await query(`SELECT COUNT(*)::int AS total FROM unified_order`);
  const total = Number(totalR.rows[0]?.total ?? 0);

  // 1) tail page (마지막 N개)
  if (tail) {
    const r = await query(
      `
      SELECT * FROM (
        SELECT u.id, u.data, o.sort_key
        FROM unified u
        JOIN unified_order o ON o.unified_id = u.id
        ORDER BY o.sort_key DESC, u.id DESC
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

  // 2) 이전 페이지 (커서보다 위)
  if (beforeSortKey != null && beforeId != null) {
    const r = await query(
      `
      WITH page AS (
        SELECT u.id, u.data, o.sort_key
        FROM unified u
        JOIN unified_order o ON o.unified_id = u.id
        WHERE (o.sort_key, u.id) < ($1::numeric, $2::int)
        ORDER BY o.sort_key DESC, u.id DESC
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
              FROM unified_order o
              WHERE (o.sort_key, o.unified_id) < ((SELECT sort_key FROM first_row), (SELECT id FROM first_row))
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

  // 3) 다음 페이지 (커서보다 아래)
  if (afterSortKey != null && afterId != null) {
    const r = await query(
      `
      WITH page AS (
        SELECT u.id, u.data, o.sort_key
        FROM unified u
        JOIN unified_order o ON o.unified_id = u.id
        WHERE (o.sort_key, u.id) > ($1::numeric, $2::int)
        ORDER BY o.sort_key ASC, u.id ASC
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
              FROM unified_order o
              WHERE (o.sort_key, o.unified_id) < ((SELECT sort_key FROM first_row), (SELECT id FROM first_row))
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

  // 기본: limit만 주면 앞에서부터 limit개
  const r = await query(
    `
    WITH page AS (
      SELECT u.id, u.data, o.sort_key
      FROM unified u
      JOIN unified_order o ON o.unified_id = u.id
      ORDER BY o.sort_key ASC, u.id ASC
      LIMIT $1
    )
    SELECT json_agg(page ORDER BY sort_key ASC, id ASC) AS rows_json
    FROM page
    `,
    [limit]
  );

  const rows = (r.rows[0]?.rows_json ?? []) as any[];
  return NextResponse.json({ rows, total, baseIndex: 1 });
}

export async function POST(req: Request) {
  const body = await req.json();

  // 1) unified row 생성
  const r = await query(
    `INSERT INTO unified (data) VALUES ($1) RETURNING id, data`,
    [body]
  );
  const created = r.rows[0];

  // 2) unified_order에도 기본 sort_key 부여 (맨 뒤로)
  const maxR = await query(
    `SELECT COALESCE(MAX(sort_key), 0) AS max FROM unified_order`
  );
  const max = Number(maxR.rows[0]?.max ?? 0);
  const nextKey = max + 1000;

  await query(
    `INSERT INTO unified_order (unified_id, sort_key) VALUES ($1, $2)
     ON CONFLICT (unified_id) DO NOTHING`,
    [created.id, nextKey]
  );

  return NextResponse.json(created);
}