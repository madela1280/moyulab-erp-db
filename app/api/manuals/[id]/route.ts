// app/api/manuals/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureManualTable } from "../_lib/ensureManualTable";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureManualTable();

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "no_data" }, { status: 400 });
    }

    const { id } = await context.params;
    const title = typeof body.title === "string" ? body.title : "";
    const content = typeof body.body === "string" ? body.body : "";
    const images = Array.isArray(body.images) ? body.images : [];
    const keywords = typeof body.keywords === "string" ? body.keywords : "";
    // ⚠ orderIndex를 안 보낸 수정은 기존 순서를 유지해야 한다(0으로 리셋되면 안 됨).
    const orderIndex = Number.isFinite(body.orderIndex) ? body.orderIndex : null;

    await query(
      `UPDATE manuals SET title = $1, body = $2, images = $3::jsonb, keywords = $4,
         order_index = COALESCE($5::int, order_index), updated_at = NOW()
       WHERE id = $6`,
      [title, content, JSON.stringify(images), keywords, orderIndex, id]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/manuals/[id] error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureManualTable();
    const { id } = await context.params;
    await query(`DELETE FROM manuals WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/manuals/[id] error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
