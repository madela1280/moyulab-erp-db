import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getId(req: Request) {
  const url = new URL(req.url);
  return url.pathname.split("/").pop();
}

// ✅ 테이블 미생성으로 500 나는 것 방지: 자동 생성(있으면 무시)
async function ensureLactinaTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_lactina (
      id   SERIAL PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS device_lactina_order (
      lactina_id INT PRIMARY KEY REFERENCES device_lactina(id) ON DELETE CASCADE,
      sort_key   NUMERIC NOT NULL
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_device_lactina_order_sort
    ON device_lactina_order(sort_key, lactina_id);
  `);
}

export async function GET(req: Request) {
  try {
    await ensureLactinaTables();

    const id = getId(req);
    const r = await query(`SELECT id, data FROM device_lactina WHERE id=$1`, [id]);

    if (!r.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(r.rows[0]);
  } catch (e) {
    console.error("GET /api/devices/lactina/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await ensureLactinaTables();

    const id = getId(req);
    const body = await req.json().catch(() => ({}));

    const old = await query(`SELECT data FROM device_lactina WHERE id=$1`, [id]);
    if (!old.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const source = old.rows[0]?.data || {};

    // null 포함 merge
    const merged: Record<string, any> = { ...source };
    for (const key in body) {
      merged[key] = (body as any)[key];
    }

    const r = await query(
      `UPDATE device_lactina SET data=$1 WHERE id=$2 RETURNING id, data`,
      [merged, id]
    );

    return NextResponse.json(r.rows[0]);
  } catch (e) {
    console.error("PATCH /api/devices/lactina/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await ensureLactinaTables();

    const id = getId(req);
    await query(`DELETE FROM device_lactina WHERE id=$1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/devices/lactina/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}