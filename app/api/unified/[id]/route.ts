import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const keys = Object.keys(body);
  const vals = Object.values(body);

  const sets = keys.map((k, i) => `"${k}"=$${i + 1}`).join(", ");

  try {
    const result = await query(
      `UPDATE unified SET ${sets} WHERE id=$${keys.length + 1} RETURNING *`,
      [...vals, params.id]
    );
    return NextResponse.json(result.rows[0]);
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await query(`DELETE FROM unified WHERE id=$1`, [params.id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
