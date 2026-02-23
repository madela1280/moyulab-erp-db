import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getId(req: Request) {
  const url = new URL(req.url);
  return url.pathname.split("/").pop();
}

function isPlainObject(v: any) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

async function ensureRecovery2Tables() {
  await query(`
    CREATE TABLE IF NOT EXISTS recovery2 (
      id   SERIAL PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS recovery2_order (
      recovery2_id INT PRIMARY KEY REFERENCES recovery2(id) ON DELETE CASCADE,
      sort_key NUMERIC NOT NULL
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_recovery2_order_sort
    ON recovery2_order(sort_key, recovery2_id);
  `);
}

export async function GET(req: Request) {
  try {
    await ensureRecovery2Tables();

    const id = getId(req);
    const r = await query(`SELECT id, data FROM recovery2 WHERE id=$1`, [id]);

    if (!r.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(r.rows[0]);
  } catch (e) {
    console.error("GET /api/recovery2/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await ensureRecovery2Tables();

    const id = getId(req);
    const body = await req.json().catch(() => null);

    if (!isPlainObject(body)) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    const r = await query(
      `
      UPDATE recovery2
      SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb
      WHERE id = $2
      RETURNING id, data
      `,
      [JSON.stringify(body ?? {}), id]
    );

    if (!r.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(r.rows[0]);
  } catch (e) {
    console.error("PATCH /api/recovery2/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await ensureRecovery2Tables();

    const id = getId(req);

    await query(
      `
      WITH del_order AS (
        DELETE FROM recovery2_order
        WHERE recovery2_id = $1
        RETURNING recovery2_id
      )
      DELETE FROM recovery2
      WHERE id = $1
      `,
      [id]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/recovery2/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}