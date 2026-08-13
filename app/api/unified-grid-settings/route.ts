// app/api/unified-grid-settings/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  unifiedColumns,
} from "@/unified/columns/unifiedColumns";

const BASE_STEP = 1000;

function clampUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function getBaseColumns() {
  return [...(unifiedColumns as unknown as string[])];
}

async function tableExists(tableName: string): Promise<boolean> {
  const r = await query(`SELECT to_regclass($1) AS reg`, [`public.${tableName}`]);
  return !!r.rows?.[0]?.reg;
}

async function getGlobalOrder(): Promise<string[]> {
  const base = getBaseColumns().map((key, i) => ({
    key,
    sort_key: (i + 1) * BASE_STEP,
  }));

  let custom: Array<{ key: string; sort_key: number }> = [];

  if (await tableExists("unified_custom_columns")) {
    const r = await query(
      `
      SELECT key, sort_key::numeric AS sort_key
      FROM unified_custom_columns
      ORDER BY sort_key ASC, key ASC
      `
    );

    custom = (r.rows || [])
      .map((x: any) => ({
        key: String(x?.key ?? "").trim(),
        sort_key: Number(x?.sort_key),
      }))
      .filter((x) => x.key && Number.isFinite(x.sort_key));
  }

  const combined = [...base, ...custom].sort((a, b) => a.sort_key - b.sort_key);

  const seen = new Set<string>();
  const out: string[] = [];

  for (const c of combined) {
    if (!c.key) continue;
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push(c.key);
  }

  return out.length ? out : getBaseColumns();
}

function mergeUserOrderWithGlobal(userOrder: any, globalOrder: string[]) {
  const gSet = new Set(globalOrder);
  const baseColumns = getBaseColumns();
  const baseSet = new Set(baseColumns);

  const rawUser = Array.isArray(userOrder) ? userOrder.map(String).filter(Boolean) : [];

  const result: string[] = [];
  const seen = new Set<string>();

  // 1) globalOrder 순서를 기준으로 순회
  for (const key of globalOrder) {
    if (!key) continue;
    if (seen.has(key)) continue;

    // 기본 컬럼은 무조건 unifiedColumns/globalOrder 위치대로 포함
    if (baseSet.has(key)) {
      result.push(key);
      seen.add(key);
      continue;
    }

    // 커스텀 컬럼도 globalOrder에 있으면 포함
    result.push(key);
    seen.add(key);
  }

  // 2) 혹시 사용자 설정에는 있는데 globalOrder에 없는 커스텀 컬럼은 뒤에 보존
  for (const key of rawUser) {
    if (!key) continue;
    if (seen.has(key)) continue;
    if (baseSet.has(key)) continue;
    if (gSet.has(key)) continue;

    result.push(key);
    seen.add(key);
  }

  return result.length ? result : baseColumns;
}

function sanitizeWidths(input: any, globalOrder: string[]): Record<string, number> {
  const base: Record<string, number> = {};

  for (const k of getBaseColumns()) {
    base[k] = DEFAULT_COL_WIDTH_UNIT_BY_KEY[k] ?? 20;
  }

  for (const k of globalOrder) {
    if (!(k in base)) base[k] = 20;
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  for (const k of globalOrder) {
    if (k in input) base[k] = clampUnit((input as any)[k]);
  }

  for (const k of Object.keys(input)) {
    if (!(k in base)) base[k] = clampUnit((input as any)[k]);
  }

  return base;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const globalOrder = await getGlobalOrder();

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
      columnOrder: mergeUserOrderWithGlobal(null, globalOrder),
      colWidthUnitByKey: sanitizeWidths(null, globalOrder),
    });
  }

  const row = r.rows[0];

  return NextResponse.json({
    columnOrder: mergeUserOrderWithGlobal(row.column_order, globalOrder),
    colWidthUnitByKey: sanitizeWidths(row.col_width_unit_by_key, globalOrder),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const globalOrder = await getGlobalOrder();
  const body = await req.json().catch(() => ({}));

  const columnOrder = mergeUserOrderWithGlobal(body?.columnOrder, globalOrder);
  const colWidthUnitByKey = sanitizeWidths(body?.colWidthUnitByKey, globalOrder);

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