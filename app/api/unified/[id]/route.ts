import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// ✅ Next.js App Router에서 정석적으로 params로 id 받기
export async function PATCH(
  req: Request,
  context: { params: { id: string } }
) {
  const id = context.params.id;
  const body = await req.json(); // { key: value }

  // 기존 row 불러오기
  const old = await query(`SELECT data FROM unified WHERE id=$1`, [id]);
  const merged = { ...old.rows[0].data, ...body };

  const r = await query(
    `UPDATE unified SET data=$1 WHERE id=$2 RETURNING id, data`,
    [merged, id]
  );

  return NextResponse.json(r.rows[0]);
}

export async function DELETE(
  req: Request,
  context: { params: { id: string } }
) {
  const id = context.params.id;

  await query(`DELETE FROM unified WHERE id=$1`, [id]);

  return NextResponse.json({ ok: true });
}




