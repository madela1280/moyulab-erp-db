import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DEFAULT_WIDTH = 140;

const DEFAULT_COLUMNS = [
  "recipientName",
  "phone1",
  "phone2",
  "contractAddress",
  "itemName",
  "startDate",
  "shipmentDate",
  "boxCount",
  "zipCode",
  "blankX1",
  "blankX2",
  "blankX3",
  "memo",
  "originalInvoiceNo",
];

type SpecificDateShipmentCustomColumn = {
  key: string;
  label: string;
  width: number;
  sortOrder: number;
};

async function ensureTable() {
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

function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeWidth(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.max(60, Math.min(800, Math.round(n)));
}

function makeColumnKey() {
  return `custom_${randomUUID().replace(/-/g, "")}`;
}

function normalizePosition(v: unknown) {
  return v === "before" ? "before" : "after";
}

async function getCustomColumns(): Promise<SpecificDateShipmentCustomColumn[]> {
  await ensureTable();

  const result = await query(`
    SELECT key, label, width, sort_order
    FROM specific_date_shipment_columns
    ORDER BY sort_order ASC, created_at ASC
  `);

  const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];

  return rows.map((row: any): SpecificDateShipmentCustomColumn => ({
    key: String(row.key),
    label: String(row.label),
    width: normalizeWidth(row.width),
    sortOrder: Number(row.sort_order || 0),
  }));
}

async function loadCurrentColumnOrder() {
  await ensureSettingsTable();

  const customColumns = await getCustomColumns();
  const allowedKeys = [...DEFAULT_COLUMNS, ...customColumns.map((col) => col.key)];

  const result = await query(
    `
    SELECT column_order
    FROM specific_date_shipment_grid_settings
    WHERE id = $1
    `,
    ["specific_date_shipment_default"]
  );

  const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
  const rawOrder: string[] = Array.isArray(row?.column_order) ? row.column_order.map((v: unknown) => String(v)) : [];

  const allowed = new Set<string>(allowedKeys);
  const unique: string[] = Array.from(
    new Set<string>(rawOrder.map((v: string) => String(v || "").trim()).filter((v: string) => Boolean(v)))
  );
  const filtered: string[] = unique.filter((key: string) => allowed.has(key));
  const missing: string[] = allowedKeys.filter((key: string) => !filtered.includes(key));

  return [...filtered, ...missing];
}

async function saveColumnOrder(columnOrder: string[]) {
  await ensureSettingsTable();

  await query(
    `
    INSERT INTO specific_date_shipment_grid_settings (id, column_order, column_widths, updated_at)
    VALUES ($1, $2::jsonb, '{}'::jsonb, NOW())
    ON CONFLICT (id)
    DO UPDATE SET
      column_order = EXCLUDED.column_order,
      updated_at = NOW()
    `,
    ["specific_date_shipment_default", JSON.stringify(columnOrder)]
  );
}

function buildNextOrderAfterInsert(currentOrder: string[], newKey: string, referenceKey: string, position: "after" | "before") {
  const withoutNewKey = currentOrder.filter((key) => key !== newKey);
  const refIndex = withoutNewKey.indexOf(referenceKey);

  if (refIndex < 0) {
    return [...withoutNewKey, newKey];
  }

  const insertAt = position === "before" ? refIndex : refIndex + 1;
  const next = [...withoutNewKey];
  next.splice(insertAt, 0, newKey);

  return next;
}

export async function GET() {
  try {
    const columns = await getCustomColumns();

    return NextResponse.json({
      ok: true,
      columns: columns.map((col) => ({
        key: col.key,
        label: col.label,
        width: col.width,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "특정일자출고 추가 컬럼을 불러오지 못했습니다.",
        columns: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    await ensureSettingsTable();

    const body = await req.json().catch(() => null);
    const label = normalizeText(body?.label);
    const width = normalizeWidth(body?.width);
    const referenceKey = normalizeText(body?.referenceKey);
    const position = normalizePosition(body?.position);

    if (!label) {
      return NextResponse.json(
        {
          ok: false,
          message: "컬럼명을 입력하세요.",
        },
        { status: 400 }
      );
    }

    if (!referenceKey) {
      return NextResponse.json(
        {
          ok: false,
          message: "기준 컬럼을 선택하세요.",
        },
        { status: 400 }
      );
    }

    const maxResult = await query(`
      SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order
      FROM specific_date_shipment_columns
    `);

    const maxRow = Array.isArray((maxResult as any)?.rows) ? (maxResult as any).rows[0] : null;
    const nextSortOrder = Number(maxRow?.max_sort_order || 0) + 1;
    const key = makeColumnKey();

    await query(
      `
      INSERT INTO specific_date_shipment_columns (key, label, width, sort_order, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      `,
      [key, label, width, nextSortOrder]
    );

    const currentOrder = await loadCurrentColumnOrder();
    const nextOrder = buildNextOrderAfterInsert(currentOrder, key, referenceKey, position);
    await saveColumnOrder(nextOrder);

    const columns = await getCustomColumns();

    return NextResponse.json({
      ok: true,
      column: {
        key,
        label,
        width,
      },
      columns: columns.map((col) => ({
        key: col.key,
        label: col.label,
        width: col.width,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "특정일자출고 추가 컬럼을 저장하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
