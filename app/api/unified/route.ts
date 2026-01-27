// C:\Users\USER\Desktop\moyulab-erp-db\app\api\unified\route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function toInt(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

// sort_key는 소수 가능 → numeric으로 처리
function toNum(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

// ✅ 거래처분류 → 안내분류 매핑 조회(신규 생성 시 자동세팅용)
async function findGuideByPartnerName(partnerName: string): Promise<string | null> {
  const p = normalizeString(partnerName);
  if (!p) return null;

  const r = await query(
    `SELECT guide_name
     FROM partner_guide_map
     WHERE partner_name=$1
     LIMIT 1`,
    [p]
  );

  const g = normalizeString(r.rows?.[0]?.guide_name);
  return g ? g : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  // meta=count : 전체 개수만
  // ✅ Grid가 사용하는 total/정렬 기준은 unified_order이므로 count도 동일 기준으로 맞춘다.
  // (unified vs unified_order 불일치 시 reload가 반복되며 점멸/스크롤튐 발생 가능)
  if ((sp.get("meta") || "").toLowerCase() === "count") {
    const r = await query(`SELECT COUNT(*)::int AS count FROM unified_order`);
    return NextResponse.json({ count: Number(r.rows[0]?.count ?? 0) });
  }

  // ids=1,2,3 : 현재 화면에 떠있는 행만 부분 갱신(merge)용
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
      SELECT u.id, u.data, o.sort_key
      FROM unified u
      JOIN unified_order o ON o.unified_id = u.id
      WHERE u.id = ANY($1::int[])
      ORDER BY o.sort_key ASC, u.id ASC
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

  // 기존 호환: 파라미터 없이 호출되면 예전처럼 "전체" 반환(기존 흐름 보호)
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

  const totalR = await query(`SELECT COUNT(*)::int AS total FROM unified_order`);
  const total = Number(totalR.rows[0]?.total ?? 0);

  // 0) 마지막 "데이터가 있는 행" 기준 tail (최적화: 마지막 N개만 스캔)
  if (tailData) {
    const scanLimit = Math.min(20000, Math.max(2000, limit * 10));

    const cursorR = await query(
      `
      WITH candidates AS (
        SELECT u.id, u.data, o.sort_key
        FROM unified u
        JOIN unified_order o ON o.unified_id = u.id
        ORDER BY o.sort_key DESC, u.id DESC
        LIMIT $1
      ),
      last_data AS (
        SELECT c.sort_key, c.id
        FROM candidates c
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_each_text(c.data) kv
          WHERE kv.value IS NOT NULL AND kv.value <> ''
        )
        ORDER BY c.sort_key DESC, c.id DESC
        LIMIT 1
      ),
      last_any AS (
        SELECT c.sort_key, c.id
        FROM candidates c
        ORDER BY c.sort_key DESC, c.id DESC
        LIMIT 1
      )
      SELECT
        COALESCE((SELECT sort_key FROM last_data), (SELECT sort_key FROM last_any), 0) AS sort_key,
        COALESCE((SELECT id FROM last_data), (SELECT id FROM last_any), 0) AS id
      `,
      [scanLimit]
    );

    const cursorSortKey = cursorR.rows[0]?.sort_key ?? 0;
    const cursorId = Number(cursorR.rows[0]?.id ?? 0);

    const pageR = await query(
      `
      SELECT * FROM (
        SELECT u.id, u.data, o.sort_key
        FROM unified u
        JOIN unified_order o ON o.unified_id = u.id
        WHERE (o.sort_key, u.id) <= ($1::numeric, $2::int)
        ORDER BY o.sort_key DESC, u.id DESC
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
      FROM unified_order o
      WHERE (o.sort_key, o.unified_id) <= ($1::numeric, $2::int)
      `,
      [cursorSortKey, cursorId]
    );
    const pos = Number(posR.rows[0]?.pos ?? rows.length);
    const baseIndex = Math.max(1, pos - rows.length + 1);

    return NextResponse.json({ rows, total, baseIndex });
  }

  // 1) tail page (진짜 마지막 N개)
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

  // 2) 이전 페이지
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

  // 3) 다음 페이지
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

  // ✅ 상태는 파생 표시 컬럼이므로 저장 대상에서 제외(무시)
  // ✅ 거래처분류가 있으면 안내분류를 매핑 기준으로 자동 세팅
  const data: Record<string, any> = body && typeof body === "object" && !Array.isArray(body) ? { ...body } : {};

  delete data["상태"];

  if (Object.prototype.hasOwnProperty.call(data, "거래처분류")) {
    const partner = normalizeString(data["거래처분류"]);
    if (!partner) {
      data["안내분류"] = null;
    } else {
      const guide = await findGuideByPartnerName(partner);
      data["안내분류"] = guide ? guide : null;
    }
  }

  const r = await query(`INSERT INTO unified (data) VALUES ($1) RETURNING id, data`, [data]);
  const created = r.rows[0];

  const maxR = await query(`SELECT COALESCE(MAX(sort_key), 0) AS max FROM unified_order`);
  const max = Number(maxR.rows[0]?.max ?? 0);
  const nextKey = max + 1000;

  await query(
    `INSERT INTO unified_order (unified_id, sort_key) VALUES ($1, $2)
     ON CONFLICT (unified_id) DO NOTHING`,
    [created.id, nextKey]
  );

  return NextResponse.json(created);
}