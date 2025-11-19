import { NextResponse } from "next/server";
import { query } from "@/lib/db";

//
// GET → unified 테이블 전체 조회
//
export async function GET() {
  try {
    const result = await query(`
      SELECT *
      FROM unified
      ORDER BY id ASC
    `);

    return NextResponse.json(result.rows, { status: 200 });
  } catch (err) {
    console.error("❌ unified GET 실패:", err);
    return NextResponse.json(
      { ok: false, error: "DB read failed" },
      { status: 500 }
    );
  }
}

//
// POST → 테이블 전체 덮어쓰기
//
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];

    await query("BEGIN");

    // 전체 지우고
    await query("DELETE FROM unified");

    // 새 데이터 insert
    for (const r of rows) {
      const keys = Object.keys(r);
      if (!keys.length) continue;

      const cols = keys.map(k => `"${k}"`).join(", ");
      const params = keys.map((_, i) => `$${i + 1}`).join(", ");
      const values = keys.map(k => r[k]);

      await query(
        `INSERT INTO unified (${cols}) VALUES (${params})`,
        values
      );
    }

    await query("COMMIT");

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("❌ unified POST 실패:", err);
    await query("ROLLBACK");
    return NextResponse.json(
      { ok: false, error: "DB write failed" },
      { status: 500 }
    );
  }
}






