import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const SETTING_ID = "return_recovery_default";

const DEFAULT_COLUMN_KEYS = [
  "senderName",
  "senderPhone1",
  "senderPhone2",
  "senderAddress",
  "itemName",
  "pickupDate",
  "boxCount",
  "zipCode",
  "blankX1",
  "blankX2",
  "blankX3",
  "memo",
  "originalInvoiceNo",
];

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS return_recovery_grid_settings (
      id TEXT PRIMARY KEY,
      column_order JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function normalizeColumnOrder(value: unknown) {
  const input = Array.isArray(value) ? value : [];
  const unique = Array.from(new Set(input.map((v) => String(v || "").trim()).filter(Boolean)));

  const allowed = new Set(DEFAULT_COLUMN_KEYS);
  const filtered = unique.filter((key) => allowed.has(key));
  const missing = DEFAULT_COLUMN_KEYS.filter((key) => !filtered.includes(key));

  return [...filtered, ...missing];
}

export async function GET() {
  try {
    await ensureTable();

    const result = await query(
      `
      SELECT column_order
      FROM return_recovery_grid_settings
      WHERE id = $1
      `,
      [SETTING_ID]
    );

    const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
    const columnOrder = normalizeColumnOrder(row?.column_order);

    return NextResponse.json({
      ok: true,
      columnOrder,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "반납회수 열 설정을 불러오지 못했습니다.",
        columnOrder: DEFAULT_COLUMN_KEYS,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureTable();

    const body = await req.json().catch(() => null);
    const columnOrder = normalizeColumnOrder(body?.columnOrder);

    await query(
      `
      INSERT INTO return_recovery_grid_settings (id, column_order, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        column_order = EXCLUDED.column_order,
        updated_at = NOW()
      `,
      [SETTING_ID, JSON.stringify(columnOrder)]
    );

    return NextResponse.json({
      ok: true,
      columnOrder,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "반납회수 열 설정을 저장하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}