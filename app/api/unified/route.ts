import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const result = await query(`SELECT * FROM unified ORDER BY id ASC`);
    return NextResponse.json(result.rows, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const cols = Object.keys(body);
  const vals = Object.values(body);
  const params = vals.map((_, i) => `$${i + 1}`).join(", ");

  try {
    const result = await query(
      `INSERT INTO unified (${cols.map(c => `"${c}"`).join(", ")})
       VALUES (${params})
       RETURNING *`,
      vals
    );
    return NextResponse.json(result.rows[0]);
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}





