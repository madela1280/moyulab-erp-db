import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// PATCH (타입 수정)
export async function PATCH(
  req: Request,
  context: any  // 🔥 Next.js strict 타입 검사 회피 (핵심)
) {
  const id = context.params.id;
  const body = await req.json();

  const old = await query(`SELECT data FROM unified WHERE id=$1`, [id]);
  const merged = { ...old.rows[0].data, ...body };

  const r = await query(
    `UPDATE unified SET data=$1 WHERE id=$2 RETURNING id, data`,
    [merged, id]
  );

  return NextResponse.json(r.rows[0]);
}

// DELETE (타입 수정)
export async function DELETE(
  req: Request,
  context: any  // 🔥 여기 또한 동일한 이유로 any 사용
) {
  const id = context.params.id;

  await query(`DELETE FROM unified WHERE id=$1`, [id]);

  return NextResponse.json({ ok: true });
}






