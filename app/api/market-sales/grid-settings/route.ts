import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isMarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";

/**
 * 마켓매출(쿠팡/스마트스토어) 그리드 설정(열 순서/너비) 저장/로드. 채널별로 따로 저장한다.
 *
 * GET  /api/market-sales/grid-settings?channel=xxx  -> { columnOrder, widthByKey }
 * POST /api/market-sales/grid-settings               -> upsert { channel, columnOrder, widthByKey }
 */

async function ensureSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS market_sales_grid_settings (
      channel TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get("channel");
    if (!isMarketSalesChannel(channel)) {
      return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
    }

    await ensureSettingsTable();

    const r = await query(`SELECT data FROM market_sales_grid_settings WHERE channel=$1 LIMIT 1`, [channel]);
    const data = (r.rows[0]?.data ?? {}) as any;

    return NextResponse.json({
      columnOrder: sanitizeColumnOrder(data.columnOrder),
      widthByKey: sanitizeWidthByKey(data.widthByKey),
    });
  } catch (e) {
    console.error("GET /api/market-sales/grid-settings error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSettingsTable();

    const body = await req.json().catch(() => ({}));
    const channel = body?.channel;
    if (!isMarketSalesChannel(channel)) {
      return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
    }

    const payload = {
      columnOrder: sanitizeColumnOrder(body?.columnOrder),
      widthByKey: sanitizeWidthByKey(body?.widthByKey),
    };

    await query(
      `
      INSERT INTO market_sales_grid_settings (channel, data)
      VALUES ($1, $2)
      ON CONFLICT (channel)
      DO UPDATE SET data = EXCLUDED.data
      `,
      [channel, payload]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/market-sales/grid-settings error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
