import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DEFAULT_WIDTH = 140;

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS return_recovery_columns (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      width INTEGER NOT NULL DEFAULT 140,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeWidth(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.max(60, Math.min(600, Math.round(n)));
}

function makeColumnKey() {
  return `custom_${randomUUID().replace(/-/g, "")}`;
}

export async function GET() {
  try {
    await ensureTable();

    const result = await query(`
      SELECT key, label, width
      FROM return_recovery_columns
      ORDER BY sort_order ASC, created_at ASC
    `);

    const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];

    return NextResponse.json({
      ok: true,
      columns: rows.map((row: any) => ({
        key: String(row.key),
        label: String(row.label),
        width: normalizeWidth(row.width),
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "반납회수 추가 컬럼을 불러오지 못했습니다.",
        columns: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();

    const body = await req.json().catch(() => null);
    const label = normalizeText(body?.label);
    const width = normalizeWidth(body?.width);

    if (!label) {
      return NextResponse.json(
        {
          ok: false,
          message: "컬럼명을 입력하세요.",
        },
        { status: 400 }
      );
    }

    const maxResult = await query(`
      SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order
      FROM return_recovery_columns
    `);

    const maxRow = Array.isArray((maxResult as any)?.rows) ? (maxResult as any).rows[0] : null;
    const nextSortOrder = Number(maxRow?.max_sort_order || 0) + 1;
    const key = makeColumnKey();

    await query(
      `
      INSERT INTO return_recovery_columns (key, label, width, sort_order, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      `,
      [key, label, width, nextSortOrder]
    );

    const result = await query(`
      SELECT key, label, width
      FROM return_recovery_columns
      ORDER BY sort_order ASC, created_at ASC
    `);

    const rows = Array.isArray((result as any)?.rows) ? (result as any).rows : [];

    return NextResponse.json({
      ok: true,
      column: {
        key,
        label,
        width,
      },
      columns: rows.map((row: any) => ({
        key: String(row.key),
        label: String(row.label),
        width: normalizeWidth(row.width),
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "반납회수 추가 컬럼을 저장하지 못했습니다.",
      },
      { status: 500 }
    );
  }
}