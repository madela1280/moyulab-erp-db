import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getId(req: Request) {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

export async function PATCH(req: Request) {
  const id = getId(req);
  const body = await req.json();
  const keys = Object.keys(body);
  const vals = Object.values(body);
  const sets = keys.map((k, i) => `"${k}"=$${i + 1}`).join(", ");

  const result = await query(
    `UPDATE unified SET ${sets} WHERE id=$${keys.length + 1} RETURNING *`,
    [...vals, id]
  );
  return NextResponse.json(result.rows[0]);
}

export async function DELETE(req: Request) {
  const id = getId(req);
  await query(`DELETE FROM unified WHERE id=$1`, [id]);
  return NextResponse.json({ ok: true });
}

