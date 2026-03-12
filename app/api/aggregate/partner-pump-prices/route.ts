import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

type Kind = "rent" | "extend";

function normalizePartnerName(v: any) {
  return String(v ?? "").trim();
}

function toNullableInt(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i <= 0) return null;
  return i;
}

function toKind(v: any): Kind | null {
  const s = String(v ?? "");
  if (s === "rent" || s === "extend") return s;
  return null;
}

async function ensureTables() {
  // pump models master (필요)
  await query(`
    CREATE TABLE IF NOT EXISTS agg_pump_models (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // mapping table
  await query(`
    CREATE TABLE IF NOT EXISTS agg_partner_pump_prices (
      partner_name TEXT NOT NULL,
      pump_model_id INT NOT NULL REFERENCES agg_pump_models(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('rent','extend')),
      price_id INT NOT NULL REFERENCES agg_prices(id) ON DELETE RESTRICT,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (partner_name, pump_model_id, kind)
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS agg_partner_pump_prices_partner_idx
    ON agg_partner_pump_prices(partner_name);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS agg_partner_pump_prices_pump_idx
    ON agg_partner_pump_prices(pump_model_id);
  `);
}

async function ensurePumpModel(id: number) {
  const r = await query(`SELECT 1 FROM agg_pump_models WHERE id=$1`, [id]);
  return r.rows.length > 0;
}

async function ensurePrice(id: number, kind: Kind) {
  const r = await query(
    `SELECT 1 FROM agg_prices WHERE id=$1 AND kind=$2 AND unit='day'`,
    [id, kind]
  );
  return r.rows.length > 0;
}

/**
 * GET /api/aggregate/partner-pump-prices?partner_name=...
 * return:
 * {
 *   ok: true,
 *   rows: [{ pump_model_id, pump_model_name, rent_day_price_id, extend_day_price_id }]
 * }
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  await ensureTables();

  const { searchParams } = new URL(req.url);
  const partner_name = normalizePartnerName(searchParams.get("partner_name"));
  if (!partner_name) {
    return NextResponse.json({ error: "INVALID_PARTNER_NAME" }, { status: 400 });
  }

  const r = await query(
    `
    SELECT
      m.id AS pump_model_id,
      m.name AS pump_model_name,
      MAX(CASE WHEN p.kind='rent' THEN p.price_id ELSE NULL END) AS rent_day_price_id,
      MAX(CASE WHEN p.kind='extend' THEN p.price_id ELSE NULL END) AS extend_day_price_id
    FROM agg_partner_pump_prices p
    JOIN agg_pump_models m ON m.id = p.pump_model_id
    WHERE p.partner_name = $1
    GROUP BY m.id, m.name
    ORDER BY m.name ASC, m.id ASC
    `,
    [partner_name]
  );

  return NextResponse.json({
    ok: true,
    rows: (r.rows || []).map((x: any) => ({
      pump_model_id: Number(x.pump_model_id),
      pump_model_name: String(x.pump_model_name ?? ""),
      rent_day_price_id: x.rent_day_price_id == null ? null : Number(x.rent_day_price_id),
      extend_day_price_id: x.extend_day_price_id == null ? null : Number(x.extend_day_price_id),
    })),
  });
}

/**
 * POST /api/aggregate/partner-pump-prices
 * body:
 * {
 *   partner_name: string,
 *   rows: Array<{
 *     pump_model_id: number,
 *     rent_day_price_id: number|null,
 *     extend_day_price_id: number|null
 *   }>
 * }
 *
 * - upsert: 값이 있으면 upsert
 * - delete: 해당 kind 값이 null이면 그 매핑은 삭제
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  await ensureTables();

  const body = await req.json().catch(() => null);
  const partner_name = normalizePartnerName(body?.partner_name);
  if (!partner_name) {
    return NextResponse.json({ error: "INVALID_PARTNER_NAME" }, { status: 400 });
  }
  if (partner_name.length > 120) {
    return NextResponse.json({ error: "PARTNER_NAME_TOO_LONG" }, { status: 400 });
  }

  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ ok: true, updated: 0 });

  let updated = 0;

  for (const row of rows) {
    const pump_model_id = toNullableInt(row?.pump_model_id);
    if (!pump_model_id) {
      return NextResponse.json({ error: "INVALID_PUMP_MODEL_ID" }, { status: 400 });
    }

    if (!(await ensurePumpModel(pump_model_id))) {
      return NextResponse.json({ error: "INVALID_PUMP_MODEL" }, { status: 400 });
    }

    const rentId = toNullableInt(row?.rent_day_price_id);
    const extId = toNullableInt(row?.extend_day_price_id);

    // rent
    if (rentId != null) {
      if (!(await ensurePrice(rentId, "rent"))) {
        return NextResponse.json({ error: "INVALID_RENT_PRICE" }, { status: 400 });
      }

      await query(
        `
        INSERT INTO agg_partner_pump_prices (partner_name, pump_model_id, kind, price_id, updated_at)
        VALUES ($1, $2, 'rent', $3, now())
        ON CONFLICT (partner_name, pump_model_id, kind)
        DO UPDATE SET price_id = EXCLUDED.price_id, updated_at = now()
        `,
        [partner_name, pump_model_id, rentId]
      );
      updated += 1;
    } else {
      await query(
        `
        DELETE FROM agg_partner_pump_prices
        WHERE partner_name=$1 AND pump_model_id=$2 AND kind='rent'
        `,
        [partner_name, pump_model_id]
      );
    }

    // extend
    if (extId != null) {
      if (!(await ensurePrice(extId, "extend"))) {
        return NextResponse.json({ error: "INVALID_EXTEND_PRICE" }, { status: 400 });
      }

      await query(
        `
        INSERT INTO agg_partner_pump_prices (partner_name, pump_model_id, kind, price_id, updated_at)
        VALUES ($1, $2, 'extend', $3, now())
        ON CONFLICT (partner_name, pump_model_id, kind)
        DO UPDATE SET price_id = EXCLUDED.price_id, updated_at = now()
        `,
        [partner_name, pump_model_id, extId]
      );
      updated += 1;
    } else {
      await query(
        `
        DELETE FROM agg_partner_pump_prices
        WHERE partner_name=$1 AND pump_model_id=$2 AND kind='extend'
        `,
        [partner_name, pump_model_id]
      );
    }
  }

  return NextResponse.json({ ok: true, updated });
}

/**
 * DELETE /api/aggregate/partner-pump-prices
 * body: { partner_name, pump_model_id }
 * - 해당 거래처의 특정 유축기 라인( rent/extend 둘 다 ) 삭제
 */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  await ensureTables();

  const body = await req.json().catch(() => null);
  const partner_name = normalizePartnerName(body?.partner_name);
  const pump_model_id = toNullableInt(body?.pump_model_id);

  if (!partner_name) return NextResponse.json({ error: "INVALID_PARTNER_NAME" }, { status: 400 });
  if (!pump_model_id) return NextResponse.json({ error: "INVALID_PUMP_MODEL_ID" }, { status: 400 });

  await query(
    `
    DELETE FROM agg_partner_pump_prices
    WHERE partner_name=$1 AND pump_model_id=$2
    `,
    [partner_name, pump_model_id]
  );

  return NextResponse.json({ ok: true });
}