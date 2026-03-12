import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

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

async function ensureCategoryLevel(id: number, level: 1 | 2 | 3) {
  const r = await query(
    `SELECT 1 FROM agg_partner_categories WHERE id=$1 AND level=$2`,
    [id, level]
  );
  return r.rows.length > 0;
}

async function ensurePrice(id: number, kind: "rent" | "extend", unit: "day") {
  const r = await query(
    `SELECT 1 FROM agg_prices WHERE id=$1 AND kind=$2 AND unit=$3`,
    [id, kind, unit]
  );
  return r.rows.length > 0;
}

/** ✅ 유축기 모델/유축기별 단가 테이블 보장(없으면 500 방지) */
async function ensurePumpPriceTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS agg_pump_models (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

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

async function loadPumpPrices(partner_name: string) {
  await ensurePumpPriceTables();

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

  return (r.rows || []).map((x: any) => ({
    pump_model_id: Number(x.pump_model_id),
    pump_model_name: String(x.pump_model_name ?? ""),
    rent_day_price_id: x.rent_day_price_id == null ? null : Number(x.rent_day_price_id),
    extend_day_price_id: x.extend_day_price_id == null ? null : Number(x.extend_day_price_id),
  }));
}

/**
 * GET /api/aggregate/partner-settings?partner_name=...
 * - 없으면 settings: null 로 반환(미설정)
 * - (추가) pump_prices: 유축기별 대여/연장 일별금액 매핑
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const partner_name = normalizePartnerName(searchParams.get("partner_name"));

  if (!partner_name) {
    return NextResponse.json({ error: "INVALID_PARTNER_NAME" }, { status: 400 });
  }

  const r = await query(
    `
    SELECT
      partner_name,
      partner_cat_l1_id,
      partner_cat_l2_id,
      partner_cat_l3_id,
      rent_day_price_id,
      extend_day_price_id,
      updated_at
    FROM agg_partner_settings
    WHERE partner_name = $1
    `,
    [partner_name]
  );

  const pump_prices = await loadPumpPrices(partner_name);

  if (!r.rows.length) {
    return NextResponse.json({ ok: true, settings: null, pump_prices });
  }

  const row = r.rows[0];
  return NextResponse.json({
    ok: true,
    settings: {
      partner_name: String(row.partner_name ?? ""),
      partner_cat_l1_id: row.partner_cat_l1_id == null ? null : Number(row.partner_cat_l1_id),
      partner_cat_l2_id: row.partner_cat_l2_id == null ? null : Number(row.partner_cat_l2_id),
      partner_cat_l3_id: row.partner_cat_l3_id == null ? null : Number(row.partner_cat_l3_id),
      rent_day_price_id: row.rent_day_price_id == null ? null : Number(row.rent_day_price_id),
      extend_day_price_id: row.extend_day_price_id == null ? null : Number(row.extend_day_price_id),
      updated_at: row.updated_at ?? null,
    },
    pump_prices,
  });
}

/**
 * POST /api/aggregate/partner-settings
 * body:
 * {
 *   partner_name,
 *   partner_cat_l1_id?, partner_cat_l2_id?, partner_cat_l3_id?,
 *   rent_day_price_id?, extend_day_price_id?,
 *   pump_prices?: Array<{
 *     pump_model_id: number,
 *     rent_day_price_id?: number|null,
 *     extend_day_price_id?: number|null
 *   }>
 * }
 *
 * - upsert 저장
 * - (추가) pump_prices는 유축기별 단가 매핑을 upsert/delete로 반영
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  const partner_name = normalizePartnerName(body?.partner_name);
  if (!partner_name) {
    return NextResponse.json({ error: "INVALID_PARTNER_NAME" }, { status: 400 });
  }
  if (partner_name.length > 120) {
    return NextResponse.json({ error: "PARTNER_NAME_TOO_LONG" }, { status: 400 });
  }

  const partner_cat_l1_id = toNullableInt(body?.partner_cat_l1_id);
  const partner_cat_l2_id = toNullableInt(body?.partner_cat_l2_id);
  const partner_cat_l3_id = toNullableInt(body?.partner_cat_l3_id);
  const rent_day_price_id = toNullableInt(body?.rent_day_price_id);
  const extend_day_price_id = toNullableInt(body?.extend_day_price_id);

  // 참조 무결성(레벨/종류까지 검증)
  if (partner_cat_l1_id != null && !(await ensureCategoryLevel(partner_cat_l1_id, 1))) {
    return NextResponse.json({ error: "INVALID_PARTNER_CAT_L1" }, { status: 400 });
  }
  if (partner_cat_l2_id != null && !(await ensureCategoryLevel(partner_cat_l2_id, 2))) {
    return NextResponse.json({ error: "INVALID_PARTNER_CAT_L2" }, { status: 400 });
  }
  if (partner_cat_l3_id != null && !(await ensureCategoryLevel(partner_cat_l3_id, 3))) {
    return NextResponse.json({ error: "INVALID_PARTNER_CAT_L3" }, { status: 400 });
  }

  if (rent_day_price_id != null && !(await ensurePrice(rent_day_price_id, "rent", "day"))) {
    return NextResponse.json({ error: "INVALID_RENT_PRICE" }, { status: 400 });
  }
  if (extend_day_price_id != null && !(await ensurePrice(extend_day_price_id, "extend", "day"))) {
    return NextResponse.json({ error: "INVALID_EXTEND_PRICE" }, { status: 400 });
  }

  // ✅ 기본 세팅 upsert(기존 동작 유지)
  const r = await query(
    `
    INSERT INTO agg_partner_settings (
      partner_name,
      partner_cat_l1_id,
      partner_cat_l2_id,
      partner_cat_l3_id,
      rent_day_price_id,
      extend_day_price_id,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, now(), now())
    ON CONFLICT (partner_name)
    DO UPDATE SET
      partner_cat_l1_id = EXCLUDED.partner_cat_l1_id,
      partner_cat_l2_id = EXCLUDED.partner_cat_l2_id,
      partner_cat_l3_id = EXCLUDED.partner_cat_l3_id,
      rent_day_price_id = EXCLUDED.rent_day_price_id,
      extend_day_price_id = EXCLUDED.extend_day_price_id,
      updated_at = now()
    RETURNING
      partner_name,
      partner_cat_l1_id,
      partner_cat_l2_id,
      partner_cat_l3_id,
      rent_day_price_id,
      extend_day_price_id,
      updated_at
    `,
    [
      partner_name,
      partner_cat_l1_id,
      partner_cat_l2_id,
      partner_cat_l3_id,
      rent_day_price_id,
      extend_day_price_id,
    ]
  );

  // ✅ (추가) 유축기별 단가 반영
  const pump_prices_input = Array.isArray(body?.pump_prices) ? body.pump_prices : null;
  if (pump_prices_input) {
    await ensurePumpPriceTables();

    for (const row of pump_prices_input) {
      const pump_model_id = toNullableInt(row?.pump_model_id);
      if (!pump_model_id) {
        return NextResponse.json({ error: "INVALID_PUMP_MODEL_ID" }, { status: 400 });
      }
      if (!(await ensurePumpModel(pump_model_id))) {
        return NextResponse.json({ error: "INVALID_PUMP_MODEL" }, { status: 400 });
      }

      const rentId = toNullableInt(row?.rent_day_price_id);
      const extId = toNullableInt(row?.extend_day_price_id);

      // rent upsert/delete
      if (rentId != null) {
        if (!(await ensurePrice(rentId, "rent", "day"))) {
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
      } else {
        await query(
          `
          DELETE FROM agg_partner_pump_prices
          WHERE partner_name=$1 AND pump_model_id=$2 AND kind='rent'
          `,
          [partner_name, pump_model_id]
        );
      }

      // extend upsert/delete
      if (extId != null) {
        if (!(await ensurePrice(extId, "extend", "day"))) {
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
  }

  const saved = r.rows[0];
  const pump_prices = await loadPumpPrices(partner_name);

  return NextResponse.json({
    ok: true,
    settings: {
      partner_name: String(saved.partner_name ?? ""),
      partner_cat_l1_id: saved.partner_cat_l1_id == null ? null : Number(saved.partner_cat_l1_id),
      partner_cat_l2_id: saved.partner_cat_l2_id == null ? null : Number(saved.partner_cat_l2_id),
      partner_cat_l3_id: saved.partner_cat_l3_id == null ? null : Number(saved.partner_cat_l3_id),
      rent_day_price_id: saved.rent_day_price_id == null ? null : Number(saved.rent_day_price_id),
      extend_day_price_id:
        saved.extend_day_price_id == null ? null : Number(saved.extend_day_price_id),
      updated_at: saved.updated_at ?? null,
    },
    pump_prices,
  });
}