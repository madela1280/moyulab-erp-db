import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const SETTING_ID = "specific_date_shipment_default";

const DEFAULT_COLUMNS = [
  { key: "checked", width: 60 },
  { key: "recipientName", width: 120 },
  { key: "phone1", width: 160 },
  { key: "phone2", width: 160 },
  { key: "contractAddress", width: 360 },
  { key: "itemName", width: 260 },
  { key: "shippingDate", width: 130 },
  { key: "startDate", width: 130 },
  { key: "shipmentDate", width: 130 },
  { key: "boxCount", width: 90 },
  { key: "zipCode", width: 100 },
  { key: "blankX1", width: 80 },
  { key: "blankX2", width: 80 },
  { key: "blankX3", width: 80 },
  { key: "memo", width: 260 },
  { key: "originalInvoiceNo", width: 130 },
];

const DEFAULT_COLUMN_KEYS = DEFAULT_COLUMNS.map((col) => col.key);

// ✅ 저장된 순서에 없는(새로 추가된) 기본 컬럼을, DEFAULT_COLUMNS상 제자리 근처에 끼워 넣는다.
function insertMissingAtDefaultPosition(currentOrder: string[], defaultOrder: string[]): string[] {
  const result = [...currentOrder];

  for (let i = 0; i < defaultOrder.length; i++) {
    const key = defaultOrder[i];
    if (result.includes(key)) continue;

    let inserted = false;

    for (let j = i - 1; j >= 0; j--) {
      const idx = result.indexOf(defaultOrder[j]);
      if (idx >= 0) {
        result.splice(idx + 1, 0, key);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      for (let j = i + 1; j < defaultOrder.length; j++) {
        const idx = result.indexOf(defaultOrder[j]);
        if (idx >= 0) {
          result.splice(idx, 0, key);
          inserted = true;
          break;
        }
      }
    }

    if (!inserted) result.push(key);
  }

  return result;
}

async function ensureSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS specific_date_shipment_grid_settings (
      id TEXT PRIMARY KEY,
      column_order JSONB NOT NULL DEFAULT '[]'::jsonb,
      column_widths JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    ALTER TABLE specific_date_shipment_grid_settings
    ADD COLUMN IF NOT EXISTS column_widths JSONB NOT NULL DEFAULT '{}'::jsonb
  `);
}

async function ensureCustomColumnsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS specific_date_shipment_columns (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      width INTEGER NOT NULL DEFAULT 140,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAllowedColumnKeys() {
  await ensureCustomColumnsTable();

  const result = await query(`
    SELECT key
    FROM specific_date_shipment_columns
    ORDER BY sort_order ASC, created_at ASC
  `);

  const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];
  const customKeys = rows.map((row: any) => String(row.key || "").trim()).filter(Boolean);

  return [...DEFAULT_COLUMN_KEYS, ...customKeys];
}

function normalizeWidth(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(60, Math.min(800, Math.round(n)));
}

function getDefaultColumnWidths() {
  return DEFAULT_COLUMNS.reduce<Record<string, number>>((acc, col) => {
    acc[col.key] = col.width;
    return acc;
  }, {});
}

function normalizeColumnOrder(value: unknown, allowedColumnKeys: string[]) {
  const input = Array.isArray(value) ? value : [];
  const allowed = new Set(allowedColumnKeys);
  const unique = Array.from(new Set(input.map((v) => String(v || "").trim()).filter(Boolean)));

  const filtered = unique.filter((key) => allowed.has(key));

  return insertMissingAtDefaultPosition(filtered, allowedColumnKeys);
}

function normalizeColumnWidths(value: unknown, allowedColumnKeys: string[]) {
  const defaults = getDefaultColumnWidths();
  const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const allowed = new Set(allowedColumnKeys);
  const next: Record<string, number> = {};

  for (const key of allowedColumnKeys) {
    const width = normalizeWidth(input[key]);

    if (width) {
      next[key] = width;
    } else if (defaults[key]) {
      next[key] = defaults[key];
    } else {
      next[key] = 140;
    }
  }

  for (const [key, rawWidth] of Object.entries(input)) {
    if (!allowed.has(key)) continue;

    const width = normalizeWidth(rawWidth);
    if (width) next[key] = width;
  }

  return next;
}

export async function GET() {
  try {
    await ensureSettingsTable();

    const allowedColumnKeys = await getAllowedColumnKeys();

    const result = await query(
      `
      SELECT column_order, column_widths
      FROM specific_date_shipment_grid_settings
      WHERE id = $1
      `,
      [SETTING_ID]
    );

    const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
    const columnOrder = normalizeColumnOrder(row?.column_order, allowedColumnKeys);
    const columnWidths = normalizeColumnWidths(row?.column_widths, allowedColumnKeys);

    return NextResponse.json({
      ok: true,
      columnOrder,
      columnWidths,
    });
  } catch (e: any) {
    const columnOrder = DEFAULT_COLUMN_KEYS;
    const columnWidths = getDefaultColumnWidths();

    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "특정일자출고 열 설정을 불러오지 못했습니다.",
        columnOrder,
        columnWidths,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureSettingsTable();

    const allowedColumnKeys = await getAllowedColumnKeys();
    const body = await req.json().catch(() => null);

    const columnOrder = normalizeColumnOrder(body?.columnOrder, allowedColumnKeys);
    const columnWidths = normalizeColumnWidths(body?.columnWidths, allowedColumnKeys);

    await query(
      `
      INSERT INTO specific_date_shipment_grid_settings (id, column_order, column_widths, updated_at)
      VALUES ($1, $2::jsonb, $3::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        column_order = EXCLUDED.column_order,
        column_widths = EXCLUDED.column_widths,
        updated_at = NOW()
      `,
      [SETTING_ID, JSON.stringify(columnOrder), JSON.stringify(columnWidths)]
    );

    return NextResponse.json({
      ok: true,
      columnOrder,
      columnWidths,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "특정일자출고 열 설정을 저장하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
