import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const r = await query(
    `
    SELECT id, name, created_at
    FROM agg_pump_models
    ORDER BY name ASC, id ASC
    `
  );

  return NextResponse.json({
    ok: true,
    items: (r.rows || []).map((x: any) => ({
      id: Number(x.id),
      name: String(x.name ?? ""),
      created_at: x.created_at ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = normalizeName(body?.name);

  if (!name) return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "NAME_TOO_LONG" }, { status: 400 });

  try {
    const r = await query(
      `
      INSERT INTO agg_pump_models (name)
      VALUES ($1)
      RETURNING id, name, created_at
      `,
      [name]
    );

    return NextResponse.json({
      ok: true,
      item: {
        id: Number(r.rows[0].id),
        name: String(r.rows[0].name ?? ""),
        created_at: r.rows[0].created_at ?? null,
      },
    });
  } catch (e: any) {
    // UNIQUE(name)
    if (e?.code === "23505") {
      return NextResponse.json({ error: "DUPLICATE_NAME" }, { status: 409 });
    }
    console.error("POST /api/aggregate/pump-models error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  // 멱등: 없어도 ok
  await query(`DELETE FROM agg_pump_models WHERE id=$1`, [id]);

  return NextResponse.json({ ok: true });
}