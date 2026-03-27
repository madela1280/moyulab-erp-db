import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function normalizePumpModelAlias(v: string) {
  const s = String(v ?? "").trim();

  if (s.includes("심포니")) return "심포니";
  if (s.includes("락티나")) return "락티나";
  if (s.includes("스윙맥") || s.includes("스윙맥시") || s.includes("스윙맥스")) return "스윙맥시";
  if (s.includes("프리스타일")) return "프리스타일";
  if (s.includes("스윙")) return "스윙";
  if (s.includes("시밀래") || s.includes("시밀레")) return "시밀래";
  if (s.includes("각시밀")) return "각시밀";

  return s;
}

async function ensurePumpModelsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS agg_pump_models (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await ensurePumpModelsTable();

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

  await ensurePumpModelsTable();

  const body = await req.json().catch(() => null);
  const rawName = normalizeName(body?.name);
  const name = normalizePumpModelAlias(rawName);

  if (!name) return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "NAME_TOO_LONG" }, { status: 400 });

  try {
    // 별칭 기준 중복도 동일하게 차단
    const dup = await query(
      `
      SELECT id
      FROM agg_pump_models
      WHERE
        CASE
          WHEN name LIKE '%심포니%' THEN '심포니'
          WHEN name LIKE '%락티나%' THEN '락티나'
          WHEN name LIKE '%스윙맥%' OR name LIKE '%스윙맥시%' OR name LIKE '%스윙맥스%' THEN '스윙맥시'
          WHEN name LIKE '%프리스타일%' THEN '프리스타일'
          WHEN name LIKE '%스윙%' THEN '스윙'
          WHEN name LIKE '%시밀래%' OR name LIKE '%시밀레%' THEN '시밀래'
          WHEN name LIKE '%각시밀%' THEN '각시밀'
          ELSE name
        END = $1
      LIMIT 1
      `,
      [name]
    );

    if ((dup.rows || []).length > 0) {
      return NextResponse.json({ error: "DUPLICATE_NAME" }, { status: 409 });
    }

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

  await ensurePumpModelsTable();

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  // 멱등: 없어도 ok
  await query(`DELETE FROM agg_pump_models WHERE id=$1`, [id]);

  return NextResponse.json({ ok: true });
}