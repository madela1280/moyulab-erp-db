import { NextResponse } from 'next/server';
import { prisma } from "@/lib/db";   // ← 얘가 진짜 정답

export async function GET() {
  try {
    const rows = await prisma.unified.findMany({
      orderBy: { id: 'asc' },
    });
    return NextResponse.json(rows);
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];

    await prisma.$transaction([
      prisma.unified.deleteMany({}),
      ...rows.map(r => prisma.unified.create({ data: r }))
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}






