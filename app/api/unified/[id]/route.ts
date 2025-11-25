import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getId(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// GET (스냅샷 비교용 — 기존 흐름 유지 위해 추가)
export async function GET(req: Request) {
  const id = getId(req);
  const r = await query(`SELECT id, data FROM unified WHERE id=$1`, [id]);
  return NextResponse.json(r.rows[0]);
}

// PATCH (기존 구조 완전 유지)
export async function PATCH(req: Request) {
  const id = getId(req);
  const body = await req.json();

  // 기존 행 가져오기
  const old = await query(`SELECT data FROM unified WHERE id=$1`, [id]);

  // 기존 방식 유지 — shallow merge
  const merged = { ...old.rows[0].data, ...body };

  // 저장
  const r = await query(
    `UPDATE unified SET data=$1 WHERE id=$2 RETURNING id, data`,
    [merged, id]
  );

  return NextResponse.json(r.rows[0]);
}

// DELETE (기존 유지)
export async function DELETE(req: Request) {
  const id = getId(req);
  await query(`DELETE FROM unified WHERE id=$1`, [id]);
  return NextResponse.json({ ok: true });
}







