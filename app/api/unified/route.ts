import { NextResponse } from 'next/server';
import { prisma } from "@/lib/db";

//
//  GET  → 통합관리 전체 데이터 불러오기
//
export async function GET() {
  try {
    const rows = await db.unified.findMany({
      orderBy: { id: 'asc' }, // 필요 시 정렬 기준 변경 가능
    });

    return NextResponse.json(rows, { status: 200 });
  } catch (err) {
    console.error('❌ /api/unified GET 오류:', err);
    return NextResponse.json(
      { ok: false, error: 'DB read failed' },
      { status: 500 }
    );
  }
}

//
//  POST  → 통합관리 전체 저장 (전체 overwrite 방식)
//
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];

    // ❗ 전체 삭제 후 bulk insert → 항상 DB = UI
    await db.$transaction([
      db.unified.deleteMany({}),
      ...rows.map((r: any) =>
        db.unified.create({ data: r })
      ),
    ]);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('❌ /api/unified POST 오류:', err);
    return NextResponse.json(
      { ok: false, error: 'DB write failed' },
      { status: 500 }
    );
  }
}





