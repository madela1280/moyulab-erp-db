import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * 롯데택배 그리드 설정(열 순서/너비) 저장/로드 (브라우저 저장소 금지 → DB 저장)
 * - 단일 row(id=1)로 관리
 *
 * GET  /api/lotte-shipment/grid-settings  -> { columnOrder, widthByKey }
 * POST /api/lotte-shipment/grid-settings  -> upsert
 */

async function ensureSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS lotte_shipment_grid_settings (
      id   INT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    INSERT INTO lotte_shipment_grid_settings (id, data)
    VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);
}

function sanitizeColumnOrder(input: any) {
  const arr = Array.isArray(input) ? input : [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const v of arr) {
    const k = String(v ?? "").trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function sanitizeWidthByKey(input: any) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[k] = Math.min(2000, Math.max(60, Math.round(n)));
  }
  return out;
}

export async function GET() {
  try {
    await ensureSettingsTable();

    const r = await query(`SELECT data FROM lotte_shipment_grid_settings WHERE id=1 LIMIT 1`);
    const data = (r.rows[0]?.data ?? {}) as any;

    return NextResponse.json({
      columnOrder: sanitizeColumnOrder(data.columnOrder),
      widthByKey: sanitizeWidthByKey(data.widthByKey),
    });
  } catch (e) {
    console.error("GET /api/lotte-shipment/grid-settings error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSettingsTable();

    const body = await req.json().catch(() => ({}));

    const payload = {
      columnOrder: sanitizeColumnOrder(body?.columnOrder),
      widthByKey: sanitizeWidthByKey(body?.widthByKey),
    };

    await query(
      `
      INSERT INTO lotte_shipment_grid_settings (id, data)
      VALUES (1, $1)
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data
      `,
      [payload]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/lotte-shipment/grid-settings error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
