import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getId(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// PATCH → 기존 JSON(data)에 덮어쓰기
export async function PATCH(req: Request) {
  const id = getId(req);
  const body = await req.json();   // { key: value }

  // 기존 row 가져오기
  const old = await query(`SELECT data FROM unified WHERE id=$1`, [id]);
  const merged = { ...old.rows[0].data, ...body };

  const r = await query(
    `UPDATE unified SET data=$1 WHERE id=$2 RETURNING id, data`,
    [merged, id]
  );

  return NextResponse.json(r.rows[0]);
}

// DELETE
export async function DELETE(req: Request) {
  const id = getId(req);
  await query(`DELETE FROM unified WHERE id=$1`, [id]);
  return NextResponse.json({ ok: true });
}



