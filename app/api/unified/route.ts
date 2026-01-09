import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  const r = await query(`
    SELECT u.id, u.data
    FROM unified u
    JOIN unified_order o ON o.unified_id = u.id
    ORDER BY o.sort_key ASC, u.id ASC
  `);
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
  //    현재 max(sort_key) + 1000
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








