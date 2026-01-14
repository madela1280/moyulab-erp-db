// app/api/unified-grid-settings/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  unifiedColumns,
} from "@/unified/columns/unifiedColumns";

/**
 * 필요한 DB 테이블(수동 1회 생성):
 *
 * CREATE TABLE IF NOT EXISTS unified_grid_settings (
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
  const allowed = new Set(unifiedColumns as unknown as string[]);
  const arr = Array.isArray(input) ? input.map(String) : [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const k of arr) {
    if (!allowed.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }

  for (const k of unifiedColumns as unknown as string[]) {
    if (!seen.has(k)) out.push(k);
  }

  return out;
}

function sanitizeWidths(input: any): Record<string, number> {
  const base = { ...DEFAULT_COL_WIDTH_UNIT_BY_KEY };
  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  for (const k of unifiedColumns as unknown as string[]) {
    if (k in input) base[k] = clampUnit((input as any)[k]);
  }
  return base;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const r = await query(
    `
    SELECT column_order, col_width_unit_by_key
    FROM unified_grid_settings
    WHERE username = $1
    `,
    [user.username]
  );

  if (!r.rows.length) {
    return NextResponse.json({
      columnOrder: sanitizeColumnOrder(null),
      colWidthUnitByKey: sanitizeWidths(null),
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

  const body = await req.json();
  const columnOrder = sanitizeColumnOrder(body?.columnOrder);
  const colWidthUnitByKey = sanitizeWidths(body?.colWidthUnitByKey);

  const upsert = await query(
    `
    INSERT INTO unified_grid_settings (username, column_order, col_width_unit_by_key, updated_at)
    VALUES ($1, $2::jsonb, $3::jsonb, now())
    ON CONFLICT (username)
    DO UPDATE SET
      column_order = EXCLUDED.column_order,
      col_width_unit_by_key = EXCLUDED.col_width_unit_by_key,
      updated_at = now()
    RETURNING username
    `,
    [user.username, JSON.stringify(columnOrder), JSON.stringify(colWidthUnitByKey)]
  );

  return NextResponse.json({
    ok: true,
    username: upsert.rows[0]?.username ?? user.username,
  });
}