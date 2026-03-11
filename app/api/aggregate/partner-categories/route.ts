import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

function toLevel(v: any): 1 | 2 | 3 | null {
  const n = Number(v);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const levelParam = searchParams.get("level");
  const level = levelParam == null ? null : toLevel(levelParam);

  if (levelParam != null && !level) {
    return NextResponse.json({ error: "INVALID_LEVEL" }, { status: 400 });
  }

  const r = level
    ? await query(
        `
        SELECT id, level, name, created_at
        FROM agg_partner_categories
        WHERE level = $1
        ORDER BY name ASC, id ASC
        `,
        [level]
      )
    : await query(
        `
        SELECT id, level, name, created_at
        FROM agg_partner_categories
        ORDER BY level ASC, name ASC, id ASC
        `
      );

  return NextResponse.json({
    ok: true,
    items: (r.rows || []).map((x: any) => ({
      id: Number(x.id),
      level: Number(x.level),
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
  const level = toLevel(body?.level);
  const name = normalizeName(body?.name);

  if (!level) return NextResponse.json({ error: "INVALID_LEVEL" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "NAME_TOO_LONG" }, { status: 400 });

  try {
    const r = await query(
      `
      INSERT INTO agg_partner_categories (level, name)
      VALUES ($1, $2)
      RETURNING id, level, name, created_at
      `,
      [level, name]
    );

    return NextResponse.json({
      ok: true,
      item: {
        id: Number(r.rows[0].id),
        level: Number(r.rows[0].level),
        name: String(r.rows[0].name ?? ""),
        created_at: r.rows[0].created_at ?? null,
      },
    });
  } catch (e: any) {
    // UNIQUE(level, name)
    if (e?.code === "23505") {
      return NextResponse.json({ error: "DUPLICATE_NAME" }, { status: 409 });
    }
    console.error("POST /api/aggregate/partner-categories error:", e);
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
  await query(`DELETE FROM agg_partner_categories WHERE id=$1`, [id]);

  return NextResponse.json({ ok: true });
}