import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

type PriceKind = "rent" | "extend";
type PriceUnit = "day";

function toKind(v: any): PriceKind | null {
  const s = String(v ?? "");
  if (s === "rent" || s === "extend") return s;
  return null;
}

function toUnit(v: any): PriceUnit | null {
  const s = String(v ?? "");
  if (s === "day") return s;
  return null;
}

function normalizeAmount(v: any): number | null {
  // "10,000" " 10000 " -> 10000
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replaceAll(",", "").replaceAll(" ", "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < 0) return null;
  return i;
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const kindParam = searchParams.get("kind");
  const unitParam = searchParams.get("unit");

  const kind = kindParam == null ? null : toKind(kindParam);
  const unit = unitParam == null ? null : toUnit(unitParam);

  if (kindParam != null && !kind) {
    return NextResponse.json({ error: "INVALID_KIND" }, { status: 400 });
  }
  if (unitParam != null && !unit) {
    return NextResponse.json({ error: "INVALID_UNIT" }, { status: 400 });
  }

  const params: any[] = [];
  const where: string[] = [];

  if (kind) {
    params.push(kind);
    where.push(`kind = $${params.length}`);
  }
  if (unit) {
    params.push(unit);
    where.push(`unit = $${params.length}`);
  }

  const r = await query(
    `
    SELECT id, kind, unit, amount, created_at
    FROM agg_prices
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY kind ASC, unit ASC, amount ASC, id ASC
    `,
    params
  );

  return NextResponse.json({
    ok: true,
    items: (r.rows || []).map((x: any) => ({
      id: Number(x.id),
      kind: String(x.kind ?? "") as PriceKind,
      unit: String(x.unit ?? "") as PriceUnit,
      amount: Number(x.amount ?? 0),
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

  const kind = toKind(body?.kind);
  const unit = toUnit(body?.unit ?? "day");
  const amount = normalizeAmount(body?.amount);

  if (!kind) return NextResponse.json({ error: "INVALID_KIND" }, { status: 400 });
  if (!unit) return NextResponse.json({ error: "INVALID_UNIT" }, { status: 400 });
  if (amount == null) return NextResponse.json({ error: "INVALID_AMOUNT" }, { status: 400 });

  try {
    const r = await query(
      `
      INSERT INTO agg_prices (kind, unit, amount)
      VALUES ($1, $2, $3)
      RETURNING id, kind, unit, amount, created_at
      `,
      [kind, unit, amount]
    );

    return NextResponse.json({
      ok: true,
      item: {
        id: Number(r.rows[0].id),
        kind: String(r.rows[0].kind ?? "") as PriceKind,
        unit: String(r.rows[0].unit ?? "") as PriceUnit,
        amount: Number(r.rows[0].amount ?? 0),
        created_at: r.rows[0].created_at ?? null,
      },
    });
  } catch (e: any) {
    // UNIQUE(kind, unit, amount)
    if (e?.code === "23505") {
      return NextResponse.json({ error: "DUPLICATE_PRICE" }, { status: 409 });
    }
    console.error("POST /api/aggregate/prices error:", e);
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
  await query(`DELETE FROM agg_prices WHERE id=$1`, [id]);

  return NextResponse.json({ ok: true });
}