import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  // unified.data->>'거래처분류' 기준으로 거래처 목록 구성
  const r = await query(`
    WITH partners AS (
      SELECT DISTINCT trim(COALESCE(u.data->>'거래처분류','')) AS partner_name
      FROM unified u
      WHERE trim(COALESCE(u.data->>'거래처분류','')) <> ''
    )
    SELECT
      p.partner_name,
      (s.partner_name IS NOT NULL) AS is_configured
    FROM partners p
    LEFT JOIN agg_partner_settings s
      ON s.partner_name = p.partner_name
    ORDER BY p.partner_name ASC
  `);

  return NextResponse.json({
    ok: true,
    partners: (r.rows || []).map((x: any) => ({
      partner_name: normalizeString(x.partner_name),
      is_configured: !!x.is_configured,
    })),
  });
}