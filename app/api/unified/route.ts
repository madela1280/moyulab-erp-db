import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// unified = id, data(jsonb)

export async function GET() {
  const r = await query(`SELECT id, data FROM unified ORDER BY id ASC`);
  return NextResponse.json(r.rows);
}

export async function POST(req: Request) {
  const body = await req.json();        // 전체 row = JSON 객체

  const r = await query(
    `INSERT INTO unified (data) VALUES ($1) RETURNING id, data`,
    [body]
  );

  return NextResponse.json(r.rows[0]);
}







