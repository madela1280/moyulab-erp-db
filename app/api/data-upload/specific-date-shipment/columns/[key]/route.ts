import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DEFAULT_COLUMN_KEYS = new Set([
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
]);

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

function normalizeKey(v: unknown) {
  return String(v ?? "").trim();
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ key: string }> }) {
  try {
    await ensureTable();

    const { key } = await context.params;
    const columnKey = normalizeKey(key);

    if (!columnKey) {
      return NextResponse.json(
        {
          ok: false,
          message: "삭제할 컬럼 key가 없습니다.",
        },
        { status: 400 }
      );
    }

    if (DEFAULT_COLUMN_KEYS.has(columnKey)) {
      return NextResponse.json(
        {
          ok: false,
          message: "기본 컬럼은 삭제할 수 없습니다.",
        },
        { status: 400 }
      );
    }

    await query(
      `
      DELETE FROM specific_date_shipment_columns
      WHERE key = $1
      `,
      [columnKey]
    );

    return NextResponse.json({
      ok: true,
      key: columnKey,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "특정일자출고 추가 컬럼을 삭제하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}
