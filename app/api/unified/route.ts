import { NextResponse } from "next/server";
import { query } from "@/lib/db";

//
// GET → 통합관리 전체 데이터 불러오기
//
export async function GET() {
  try {
    const result = await query("SELECT * FROM unified ORDER BY id ASC");
    return NextResponse.json(result.rows, { status: 200 });
  } catch (err) {
    console.error("❌ /api/unified GET 오류:", err);
    return NextResponse.json(
      { ok: false, error: "DB read failed" },
      { status: 500 }
    );
  }
}

//
// POST → 전체 덮어쓰기 방식 저장
//
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];

    // 트랜잭션 수행
    await query("BEGIN");

    // 전체 삭제
    await query("DELETE FROM unified");

    // insert 반복
    for (const r of rows) {
      const keys = Object.keys(r);
      const values = Object.values(r);

      const cols = keys.map((k) => `"${k}"`).join(", ");
      const params = values.map((_, i) => `$${i + 1}`).join(", ");

      await query(
        `INSERT INTO unified (${cols}) VALUES (${params})`,
        values
      );
    }

    await query("COMMIT");

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("❌ /api/unified POST 오류:", err);
    await query("ROLLBACK");
    return NextResponse.json(
      { ok: false, error: "DB write failed" },
      { status: 500 }
    );
  }
}






