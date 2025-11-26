import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getId(req: Request) {
  const url = new URL(req.url);
  return url.pathname.split("/").pop();
}

export async function GET(req: Request) {
  const id = getId(req);
  const r = await query(`SELECT id, data FROM unified WHERE id=$1`, [id]);

  if (!r.rows.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(r.rows[0]);
}

export async function PATCH(req: Request) {
  const id = getId(req);
  const body = await req.json();

  // 기존 데이터 읽기
  const old = await query(`SELECT data FROM unified WHERE id=$1`, [id]);
  const source = old.rows[0]?.data || {};

  // ⭐ null 값도 정확하게 merge (삭제 반영)
  const merged: Record<string, any> = { ...source };
  for (const key in body) {
    merged[key] = body[key];   // body[key] === null → null 저장
  }

  // 저장
  const r = await query(
    `UPDATE unified SET data=$1 WHERE id=$2 RETURNING id, data`,
    [merged, id]
  );

  return NextResponse.json(r.rows[0]);
}

export async function DELETE(req: Request) {
  const id = getId(req);

  await query(`DELETE FROM unified WHERE id=$1`, [id]);

  // 삭제 성공
  return NextResponse.json({ ok: true });
}












