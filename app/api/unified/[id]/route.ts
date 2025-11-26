import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getId(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
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

  const old = await query(`SELECT data FROM unified WHERE id=$1`, [id]);
  const source = old.rows[0].data;

  // ⭐ null(삭제)도 정확하게 반영되는 merge
  const merged: Record<string, any> = { ...source };
  for (const key in body) {
    merged[key] = body[key]; // value === null → 그대로 null 저장
  }

  const r = await query(
    `UPDATE unified SET data=$1 WHERE id=$2 RETURNING id, data`,
    [merged, id]
  );

  // 🔥 모든 화면 즉시 업데이트
  io.to("global").emit("unified:update");

  return NextResponse.json(r.rows[0]);
}

export async function DELETE(req: Request) {
  const id = getId(req);
  await query(`DELETE FROM unified WHERE id=$1`, [id]);

  // 🔥 삭제도 즉시 동기화
  
  return NextResponse.json({ ok: true });
}











