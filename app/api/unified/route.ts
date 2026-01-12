import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function toInt(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  // meta=count : 전체 개수만(3만행에서도 빠르게)
  if ((sp.get("meta") || "").toLowerCase() === "count") {
    const r = await query(`SELECT COUNT(*)::int AS count FROM unified`);
    return NextResponse.json({ count: Number(r.rows[0]?.count ?? 0) });
  }

  // ids=1,2,3 : 특정 id들만 조회
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

  // tail=1&limit=N : 마지막 N행만(속도 핵심)
  const tail = sp.get("tail") === "1";
  const limitRaw = toInt(sp.get("limit"));
  const limit =
    limitRaw == null ? 500 : Math.max(1, Math.min(5000, limitRaw));

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

  if (tail) {
    // DESC로 마지막 limit개 뽑고, 다시 ASC로 정렬해 화면에 자연스럽게
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
    return NextResponse.json(r.rows);
  }

  // 기본(부분조회 용도): limit만 주면 앞에서부터 limit개
  const r = await query(
    `
    SELECT u.id, u.data, o.sort_key
    FROM unified u
    JOIN unified_order o ON o.unified_id = u.id
    ORDER BY o.sort_key ASC, u.id ASC
    LIMIT $1
    `,
    [limit]
  );
  return NextResponse.json(r.rows);
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







