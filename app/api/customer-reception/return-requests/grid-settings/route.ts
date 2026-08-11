import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const SETTING_ID = "customer_return_request_default";

const DEFAULT_COLUMNS = [
  { key: "checked", width: 70, minWidth: 30 },
  { key: "processStatus", width: 90, minWidth: 60 },
  { key: "receivedAt", width: 150, minWidth: 60 },
  { key: "partnerCategory", width: 120, minWidth: 60 },
  { key: "deviceNo", width: 110, minWidth: 60 },
  { key: "product", width: 110, minWidth: 60 },
  { key: "recipientName", width: 110, minWidth: 60 },
  { key: "phone1", width: 120, minWidth: 60 },
  { key: "phone2", width: 120, minWidth: 60 },
  { key: "contractAddress", width: 220, minWidth: 60 },
  { key: "shippingDate", width: 120, minWidth: 60 },
  { key: "startDate", width: 110, minWidth: 60 },
  { key: "endDate", width: 110, minWidth: 60 },
  { key: "returnRequestDate", width: 120, minWidth: 60 },
  { key: "specialNote1", width: 140, minWidth: 60 },
  { key: "specialNote2", width: 140, minWidth: 60 },
  { key: "returnMemo", width: 180, minWidth: 60 },
  { key: "mismatchReason", width: 220, minWidth: 60 },
];

const DEFAULT_COLUMN_KEYS = DEFAULT_COLUMNS.map((col) => col.key);

async function ensureSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS customer_return_request_grid_settings (
      id TEXT PRIMARY KEY,
      column_widths JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function getDefaultColumnWidths() {
  return DEFAULT_COLUMNS.reduce<Record<string, number>>((acc, col) => {
    acc[col.key] = col.width;
    return acc;
  }, {});
}

function getMinWidth(key: string) {
  const found = DEFAULT_COLUMNS.find((col) => col.key === key);
  return found?.minWidth ?? 60;
}

function normalizeWidth(key: string, value: unknown, fallback = 120) {
  const n = Number(value);
  const min = getMinWidth(key);

  if (!Number.isFinite(n)) return Math.max(min, fallback);
  return Math.max(min, Math.min(800, Math.round(n)));
}

function normalizeColumnWidths(value: unknown) {
  const defaults = getDefaultColumnWidths();
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const next: Record<string, number> = {};

  for (const key of DEFAULT_COLUMN_KEYS) {
    next[key] = normalizeWidth(key, input[key], defaults[key] ?? 120);
  }

  return next;
}

export async function GET() {
  try {
    await ensureSettingsTable();

    const result = await query(
      `
      SELECT column_widths
      FROM customer_return_request_grid_settings
      WHERE id = $1
      `,
      [SETTING_ID]
    );

    const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
    const columnWidths = normalizeColumnWidths(row?.column_widths);

    return NextResponse.json({
      ok: true,
      columnWidths,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "반납접수 열넓이를 불러오지 못했습니다.",
        columnWidths: getDefaultColumnWidths(),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureSettingsTable();

    const body = await req.json().catch(() => null);
    const columnWidths = normalizeColumnWidths(body?.columnWidths);

    await query(
      `
      INSERT INTO customer_return_request_grid_settings (id, column_widths, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        column_widths = EXCLUDED.column_widths,
        updated_at = NOW()
      `,
      [SETTING_ID, JSON.stringify(columnWidths)]
    );

    return NextResponse.json({
      ok: true,
      columnWidths,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "반납접수 열넓이를 저장하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}