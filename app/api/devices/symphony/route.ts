import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function toInt(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  // meta=count : 전체 개수만
  if ((sp.get("meta") || "").toLowerCase() === "count") {
    const r = await query(`SELECT COUNT(*)::int AS count FROM device_symphony_order`);
    return NextResponse.json({ count: Number(r.rows[0]?.count ?? 0) });
  }

  // ids=1,2,3 : 일부 행만 부분 갱신용
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
      FROM device_symphony s
      JOIN device_symphony_order o ON o.symphony_id = s.id
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
      FROM device_symphony s
      JOIN device_symphony_order o ON o.symphony_id = s.id
      ORDER BY o.sort_key ASC, s.id ASC
    `);
    return NextResponse.json(r.rows);
  }

  const totalR = await query(`SELECT COUNT(*)::int AS total FROM device_symphony_order`);
  const total = Number(totalR.rows[0]?.total ?? 0);

  // 1) tailData=1 : 마지막 데이터 근처 로드(1차는 tail과 동일하게 동작)
  if (tailData) {
    const r = await query(
      `
      SELECT * FROM (
        SELECT s.id, s.data, o.sort_key
        FROM device_symphony s
        JOIN device_symphony_order o ON o.symphony_id = s.id
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

  // 2) tail=1 : 진짜 마지막 N개
  if (tail) {
    const r = await query(
      `
      SELECT * FROM (
        SELECT s.id, s.data, o.sort_key
        FROM device_symphony s
        JOIN device_symphony_order o ON o.symphony_id = s.id
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
      FROM device_symphony s
      JOIN device_symphony_order o ON o.symphony_id = s.id
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
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const r = await query(
    `INSERT INTO device_symphony (data) VALUES ($1) RETURNING id, data`,
    [body ?? {}]
  );
  const created = r.rows[0];

  const maxR = await query(
    `SELECT COALESCE(MAX(sort_key), 0) AS max FROM device_symphony_order`
  );
  const max = Number(maxR.rows[0]?.max ?? 0);
  const nextKey = max + 1000;

  await query(
    `
    INSERT INTO device_symphony_order (symphony_id, sort_key)
    VALUES ($1, $2)
    ON CONFLICT (symphony_id) DO NOTHING
    `,
    [created.id, nextKey]
  );

  return NextResponse.json(created);
}