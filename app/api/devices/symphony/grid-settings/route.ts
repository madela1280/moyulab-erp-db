import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * 심포니 그리드 설정 저장/로드 (브라우저 저장소 금지 → DB 저장)
 * - 단일 row(id=1)로 관리
 *
 * GET  /api/devices/symphony/grid-settings  -> { columnOrder, colWidthUnitByKey }
 * POST /api/devices/symphony/grid-settings  -> upsert
 */

async function ensureSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_symphony_grid_settings (
      id   INT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  // 기본 row(id=1) 없으면 만들어둠
  await query(`
    INSERT INTO device_symphony_grid_settings (id, data)
    VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);
}

export async function GET() {
  try {
    await ensureSettingsTable();

    const r = await query(
      `SELECT data FROM device_symphony_grid_settings WHERE id=1 LIMIT 1`
    );

    const data = (r.rows[0]?.data ?? {}) as any;

    return NextResponse.json({
      columnOrder: Array.isArray(data.columnOrder) ? data.columnOrder : [],
      colWidthUnitByKey:
        data.colWidthUnitByKey && typeof data.colWidthUnitByKey === "object"
          ? data.colWidthUnitByKey
          : {},
    });
  } catch (e) {
    console.error("GET /api/devices/symphony/grid-settings error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSettingsTable();

    const body = await req.json().catch(() => ({}));

    const payload = {
      columnOrder: Array.isArray(body?.columnOrder) ? body.columnOrder : [],
      colWidthUnitByKey:
        body?.colWidthUnitByKey && typeof body.colWidthUnitByKey === "object"
          ? body.colWidthUnitByKey
          : {},
    };

    await query(
      `
      INSERT INTO device_symphony_grid_settings (id, data)
      VALUES (1, $1)
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data
      `,
      [payload]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/devices/symphony/grid-settings error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}