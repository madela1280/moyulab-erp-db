import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * recovery1 그리드 설정(유저별) 저장/로드
 *
 * CREATE TABLE IF NOT EXISTS recovery1_grid_settings (
 *   username text PRIMARY KEY,
 *   column_order jsonb NOT NULL,
 *   col_width_unit_by_key jsonb NOT NULL,
 *   updated_at timestamptz NOT NULL DEFAULT now()
 * );
 */

function clampUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function sanitizeColumnOrder(input: any): string[] {
  const arr = Array.isArray(input) ? input.map(String) : [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const k of arr) {
    const key = String(k ?? "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }

  return out;
}

function sanitizeWidths(input: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;

  for (const [k, v] of Object.entries(input)) {
    const key = String(k ?? "").trim();
    if (!key) continue;
    out[key] = clampUnit(v);
  }

  return out;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await query(`
    CREATE TABLE IF NOT EXISTS recovery1_grid_settings (
      username text PRIMARY KEY,
      column_order jsonb NOT NULL,
      col_width_unit_by_key jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const r = await query(
    `
    SELECT column_order, col_width_unit_by_key
    FROM recovery1_grid_settings
    WHERE username = $1
    `,
    [user.username]
  );

  if (!r.rows.length) {
    return NextResponse.json({
      columnOrder: [],
      colWidthUnitByKey: {},
    });
  }

  const row = r.rows[0];
  return NextResponse.json({
    columnOrder: sanitizeColumnOrder(row.column_order),
    colWidthUnitByKey: sanitizeWidths(row.col_width_unit_by_key),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  await query(`
    CREATE TABLE IF NOT EXISTS recovery1_grid_settings (
      username text PRIMARY KEY,
      column_order jsonb NOT NULL,
      col_width_unit_by_key jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const body = await req.json().catch(() => ({}));

  const columnOrder = sanitizeColumnOrder(body?.columnOrder);
  const colWidthUnitByKey = sanitizeWidths(body?.colWidthUnitByKey);

  await query(
    `
    INSERT INTO recovery1_grid_settings (username, column_order, col_width_unit_by_key, updated_at)
    VALUES ($1, $2::jsonb, $3::jsonb, now())
    ON CONFLICT (username)
    DO UPDATE SET
      column_order = EXCLUDED.column_order,
      col_width_unit_by_key = EXCLUDED.col_width_unit_by_key,
      updated_at = now()
    `,
    [user.username, JSON.stringify(columnOrder), JSON.stringify(colWidthUnitByKey)]
  );

  return NextResponse.json({ ok: true });
}