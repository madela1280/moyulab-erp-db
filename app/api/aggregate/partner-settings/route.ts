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

/**
 * GET /api/aggregate/partner-settings?partner_name=...
 * - 없으면 settings: null 로 반환(미설정)
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

  if (!r.rows.length) {
    return NextResponse.json({ ok: true, settings: null });
  }

  const row = r.rows[0];
  return NextResponse.json({
    ok: true,
    settings: {
      partner_name: String(row.partner_name ?? ""),
      partner_cat_l1_id:
        row.partner_cat_l1_id == null ? null : Number(row.partner_cat_l1_id),
      partner_cat_l2_id:
        row.partner_cat_l2_id == null ? null : Number(row.partner_cat_l2_id),
      partner_cat_l3_id:
        row.partner_cat_l3_id == null ? null : Number(row.partner_cat_l3_id),
      rent_day_price_id:
        row.rent_day_price_id == null ? null : Number(row.rent_day_price_id),
      extend_day_price_id:
        row.extend_day_price_id == null
          ? null
          : Number(row.extend_day_price_id),
      updated_at: row.updated_at ?? null,
    },
  });
}

/**
 * POST /api/aggregate/partner-settings
 * body:
 * {
 *   partner_name,
 *   partner_cat_l1_id?, partner_cat_l2_id?, partner_cat_l3_id?,
 *   rent_day_price_id?, extend_day_price_id?
 * }
 *
 * - upsert 저장
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
    return NextResponse.json(
      { error: "PARTNER_NAME_TOO_LONG" },
      { status: 400 }
    );
  }

  const partner_cat_l1_id = toNullableInt(body?.partner_cat_l1_id);
  const partner_cat_l2_id = toNullableInt(body?.partner_cat_l2_id);
  const partner_cat_l3_id = toNullableInt(body?.partner_cat_l3_id);
  const rent_day_price_id = toNullableInt(body?.rent_day_price_id);
  const extend_day_price_id = toNullableInt(body?.extend_day_price_id);

  // 참조 무결성(레벨/종류까지 검증)
  if (
    partner_cat_l1_id != null &&
    !(await ensureCategoryLevel(partner_cat_l1_id, 1))
  ) {
    return NextResponse.json(
      { error: "INVALID_PARTNER_CAT_L1" },
      { status: 400 }
    );
  }
  if (
    partner_cat_l2_id != null &&
    !(await ensureCategoryLevel(partner_cat_l2_id, 2))
  ) {
    return NextResponse.json(
      { error: "INVALID_PARTNER_CAT_L2" },
      { status: 400 }
    );
  }
  if (
    partner_cat_l3_id != null &&
    !(await ensureCategoryLevel(partner_cat_l3_id, 3))
  ) {
    return NextResponse.json(
      { error: "INVALID_PARTNER_CAT_L3" },
      { status: 400 }
    );
  }

  if (
    rent_day_price_id != null &&
    !(await ensurePrice(rent_day_price_id, "rent", "day"))
  ) {
    return NextResponse.json({ error: "INVALID_RENT_PRICE" }, { status: 400 });
  }

  if (
    extend_day_price_id != null &&
    !(await ensurePrice(extend_day_price_id, "extend", "day"))
  ) {
    return NextResponse.json(
      { error: "INVALID_EXTEND_PRICE" },
      { status: 400 }
    );
  }

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

  const row = r.rows[0];
  return NextResponse.json({
    ok: true,
    settings: {
      partner_name: String(row.partner_name ?? ""),
      partner_cat_l1_id:
        row.partner_cat_l1_id == null ? null : Number(row.partner_cat_l1_id),
      partner_cat_l2_id:
        row.partner_cat_l2_id == null ? null : Number(row.partner_cat_l2_id),
      partner_cat_l3_id:
        row.partner_cat_l3_id == null ? null : Number(row.partner_cat_l3_id),
      rent_day_price_id:
        row.rent_day_price_id == null ? null : Number(row.rent_day_price_id),
      extend_day_price_id:
        row.extend_day_price_id == null
          ? null
          : Number(row.extend_day_price_id),
      updated_at: row.updated_at ?? null,
    },
  });
}