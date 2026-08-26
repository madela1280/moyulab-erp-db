// app/api/customer-reception/packaging-orders/grid-settings/route.ts
//
// 포장재구매 그리드의 열 순서/너비 저장. 사용자가 한 명이라 설정 1행만 유지한다
// (data-upload/return-recovery/grid-settings와 같은 패턴).

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const SETTING_ID = "packaging_order_default";

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS packaging_order_grid_settings (
      id TEXT PRIMARY KEY,
      column_order JSONB NOT NULL DEFAULT '[]'::jsonb,
      column_widths JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function GET() {
  try {
    await ensureTable();

    const result = await query(
      `SELECT column_order, column_widths FROM packaging_order_grid_settings WHERE id = $1`,
      [SETTING_ID]
    );

    const row = result.rows?.[0];

    return NextResponse.json({
      ok: true,
      columnOrder: Array.isArray(row?.column_order) ? row.column_order : [],
      columnWidths: row?.column_widths && typeof row.column_widths === "object" ? row.column_widths : {},
    });
  } catch (e) {
    console.error("GET /api/customer-reception/packaging-orders/grid-settings error:", e);
    return NextResponse.json({ ok: false, error: "server", columnOrder: [], columnWidths: {} }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await ensureTable();

    const body = await req.json().catch(() => null);
    const columnOrder = Array.isArray(body?.columnOrder) ? body.columnOrder.map((v: unknown) => String(v)) : null;
    const columnWidths =
      body?.columnWidths && typeof body.columnWidths === "object" ? body.columnWidths : null;

    if (!columnOrder && !columnWidths) {
      return NextResponse.json({ ok: false, error: "no_data" }, { status: 400 });
    }

    await query(
      `
      INSERT INTO packaging_order_grid_settings (id, column_order, column_widths, updated_at)
      VALUES ($1, COALESCE($2::jsonb, '[]'::jsonb), COALESCE($3::jsonb, '{}'::jsonb), NOW())
      ON CONFLICT (id) DO UPDATE SET
        column_order = COALESCE($2::jsonb, packaging_order_grid_settings.column_order),
        column_widths = COALESCE($3::jsonb, packaging_order_grid_settings.column_widths),
        updated_at = NOW()
      `,
      [SETTING_ID, columnOrder ? JSON.stringify(columnOrder) : null, columnWidths ? JSON.stringify(columnWidths) : null]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/customer-reception/packaging-orders/grid-settings error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
