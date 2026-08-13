// app/api/unified-grid-settings/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  DEFAULT_COL_WIDTH_UNIT_BY_KEY,
  unifiedColumns,
} from "@/unified/columns/unifiedColumns";

/**
 * 사용자별 통합관리 열 순서/열폭 설정 API
 *
 * 핵심:
 * - 기본 컬럼(unifiedColumns)은 항상 unifiedColumns 기준 위치를 우선한다.
 * - 기존 사용자 설정에 새 기본 컬럼이 맨 끝으로 저장되어 있어도,
 *   기본 컬럼끼리는 unifiedColumns 순서로 복구한다.
 * - 커스텀 컬럼은 기존 사용자 설정 순서를 최대한 유지하고 뒤쪽에 붙인다.
 */

function clampUnit(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(200, Math.floor(n)));
}

function getBaseColumns() {
  return [...(unifiedColumns as unknown as string[])];
}

function sanitizeColumnOrder(input: any): string[] {
  const baseColumns = getBaseColumns();
  const baseSet = new Set(baseColumns);

  const arr = Array.isArray(input) ? input.map(String).filter(Boolean) : [];

  // 1) 기본 컬럼은 무조건 unifiedColumns 순서로 고정
  const out: string[] = [...baseColumns];
  const seen = new Set<string>(out);

  // 2) 기존 사용자 설정에 있던 커스텀 컬럼만 뒤에 유지
  for (const k of arr) {
    if (!k) continue;
    if (baseSet.has(k)) continue;
    if (seen.has(k)) continue;

    seen.add(k);
    out.push(k);
  }

  return out;
}

function sanitizeWidths(input: any): Record<string, number> {
  const base: Record<string, number> = { ...DEFAULT_COL_WIDTH_UNIT_BY_KEY };

  if (!input || typeof input !== "object" || Array.isArray(input)) return base;

  // 기본 컬럼 폭 유지/보정
  for (const k of getBaseColumns()) {
    if (k in input) base[k] = clampUnit((input as any)[k]);
  }

  // 사용자 설정에 있던 커스텀 컬럼 폭도 보존
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

  const body = await req.json().catch(() => ({}));

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