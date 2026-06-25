import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SEARCH_COLUMNS = [
  "기기번호",
  "기종",
  "에러횟수",
  "제품",
  "수취인명",
  "연락처1",
  "연락처2",
  "계약자주소",
  "택배발송일",
  "시작일",
  "종료일",
  "반납요청일",
  "반납완료일",
] as const;

const RANGE_START_KEY = "기기번호";
const RANGE_END_KEY = "반납완료일";
const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;

function toPositiveInt(v: string | null, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(MAX_LIMIT, Math.floor(n));
}

function normalizeKeyword(v: string | null) {
  return String(v ?? "").trim();
}

type SearchRow = {
  id: number;
  sort_key: number | string | null;
  row_number: number | string | null;
  first_matched_key: string | null;
  matched_keys: string[] | null;
  total_count: number | string | null;
};

export async function GET(req: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const keyword = normalizeKeyword(url.searchParams.get("q") || url.searchParams.get("keyword"));
    const limit = toPositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT);

    if (!keyword) {
      return NextResponse.json({
        ok: true,
        query: "",
        columns: [...SEARCH_COLUMNS],
        searchedRange: { startKey: RANGE_START_KEY, endKey: RANGE_END_KEY },
        total: 0,
        returnedCount: 0,
        truncated: false,
        results: [],
      });
    }

    const sql = `
      WITH ordered_rows AS (
        SELECT
          u.id,
          u.data,
          o.sort_key,
          ROW_NUMBER() OVER (ORDER BY o.sort_key ASC, u.id ASC) AS row_number
        FROM unified u
        JOIN unified_order o
          ON o.unified_id = u.id
      ),
      matched_cells AS (
        SELECT
          r.id,
          r.sort_key,
          r.row_number,
          c.ord AS col_order,
          c.key AS col_key
        FROM ordered_rows r
        CROSS JOIN LATERAL unnest($1::text[]) WITH ORDINALITY AS c(key, ord)
        WHERE strpos(lower(COALESCE(r.data ->> c.key, '')), lower($2::text)) > 0
      ),
      matched_rows AS (
        SELECT
          m.id,
          m.sort_key,
          m.row_number,
          (array_agg(m.col_key ORDER BY m.col_order))[1] AS first_matched_key,
          array_agg(m.col_key ORDER BY m.col_order) AS matched_keys
        FROM matched_cells m
        GROUP BY m.id, m.sort_key, m.row_number
      )
      SELECT
        mr.id,
        mr.sort_key,
        mr.row_number,
        mr.first_matched_key,
        mr.matched_keys,
        COUNT(*) OVER() AS total_count
      FROM matched_rows mr
      ORDER BY mr.sort_key ASC, mr.id ASC
      LIMIT $3
    `;

    const result = await query(sql, [[...SEARCH_COLUMNS], keyword, limit]);
    const rows = (result.rows ?? []) as SearchRow[];

    const total = Number(rows[0]?.total_count ?? 0);

    return NextResponse.json({
      ok: true,
      query: keyword,
      columns: [...SEARCH_COLUMNS],
      searchedRange: { startKey: RANGE_START_KEY, endKey: RANGE_END_KEY },
      total,
      returnedCount: rows.length,
      truncated: total > rows.length,
      results: rows.map((row) => ({
        id: Number(row.id),
        sortKey: row.sort_key == null ? null : Number(row.sort_key),
        rowNumber: row.row_number == null ? null : Number(row.row_number),
        firstMatchedKey: String(row.first_matched_key ?? ""),
        matchedKeys: Array.isArray(row.matched_keys) ? row.matched_keys.map(String) : [],
      })),
    });
  } catch (error) {
    console.error("[GET /api/unified/search] failed:", error);
    return NextResponse.json({ error: "SEARCH_FAILED" }, { status: 500 });
  }
}