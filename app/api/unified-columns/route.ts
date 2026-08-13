// app/api/unified-grid-settings/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  unifiedColumns,
} from "@/unified/columns/unifiedColumns";

/**
 * unified_grid_settings:
 * - 사용자별 통합관리 열 순서/열폭 저장
 * - 기본 컬럼이 새로 추가되면 기존 사용자 설정에도 globalOrder 위치 기준으로 자동 삽입
 */

const BASE_STEP = 1000;

function clampUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

async function tableExists(tableName: string): Promise<boolean> {
  const r = await query(`SELECT to_regclass($1) AS reg`, [`public.${tableName}`]);
  return !!r.rows?.[0]?.reg;
}

async function getGlobalOrder(): Promise<string[]> {
  const base = (unifiedColumns as unknown as string[]).map((key, i) => ({
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

  return out.length ? out : [...(unifiedColumns as unknown as string[])];
}

function mergeUserOrderWithGlobal(userOrder: any, globalOrder: string[]) {
  const gSet = new Set(globalOrder);

  const base = Array.isArray(userOrder) ? userOrder.map(String) : [];
  const filtered = base.filter((k) => gSet.has(k));

  const result: string[] = [];
  const rSet = new Set<string>();

  for (const k of filtered) {
    if (rSet.has(k)) continue;
    rSet.add(k);
    result.push(k);
  }

  // ✅ 기존 사용자 설정에 없는 새 기본 컬럼은 globalOrder 기준 위치에 삽입
  for (let i = 0; i < globalOrder.length; i++) {
    const k = globalOrder[i];
    if (rSet.has(k)) continue;

    let inserted = false;

    // 1) globalOrder상 바로 앞쪽에 있는 컬럼 뒤에 삽입
    for (let j = i - 1; j >= 0; j--) {
      const prev = globalOrder[j];
      const idx = result.indexOf(prev);
      if (idx >= 0) {
        result.splice(idx + 1, 0, k);
        inserted = true;
        break;
      }
    }

    // 2) 앞 기준을 못 찾으면 뒤쪽 컬럼 앞에 삽입
    if (!inserted) {
      for (let j = i + 1; j < globalOrder.length; j++) {
        const next = globalOrder[j];
        const idx = result.indexOf(next);
        if (idx >= 0) {
          result.splice(idx, 0, k);
          inserted = true;
          break;
        }
      }
    }

    // 3) 그래도 없으면 맨 뒤
    if (!inserted) result.push(k);

    rSet.add(k);
  }

  return result;
}

function sanitizeWidths(input: any, globalOrder: string[]): Record<string, number> {
  const base: Record<string, number> = {};

  for (const k of unifiedColumns as unknown as string[]) {
    base[k] = DEFAULT_COL_WIDTH_UNIT_BY_KEY[k] ?? 20;
  }

  for (const k of globalOrder) {
    if (!(k in base)) base[k] = 20;
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  for (const k of globalOrder) {
    if (k in input) base[k] = clampUnit((input as any)[k]);
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