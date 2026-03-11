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

  // unified + (가능하면) 회수완료(recovery1/2) 소스까지 포함해 거래처 목록 구성
  // - recovery 테이블명은 환경마다 다를 수 있으므로, 존재하는 것만 자동 포함
  const candidates = [
    "recovery1",
    "recovery2",
    "recovery_complete_1",
    "recovery_complete_2",
    "recovery_recovery1",
    "recovery_recovery2",
  ];

  const existR = await query(
    `
    SELECT t.name
    FROM unnest($1::text[]) AS t(name)
    WHERE to_regclass('public.' || t.name) IS NOT NULL
    `,
    [candidates]
  );

  const existingTables = (existR.rows || [])
    .map((x: any) => String(x?.name || "").trim())
    .filter(Boolean);

  const unionParts: string[] = [];

  // 1) 통합관리(unified)
  unionParts.push(`
    SELECT DISTINCT trim(COALESCE(u.data->>'거래처분류','')) AS partner_name
    FROM unified u
    WHERE trim(COALESCE(u.data->>'거래처분류','')) <> ''
  `);

  // 2) 회수완료 테이블(존재하는 경우만)
  for (const t of existingTables) {
    // table name is from allowlist(candidates) -> safe to interpolate
    unionParts.push(`
      SELECT DISTINCT trim(COALESCE(x.data->>'거래처분류','')) AS partner_name
      FROM ${t} x
      WHERE trim(COALESCE(x.data->>'거래처분류','')) <> ''
    `);
  }

  const sql = `
    WITH partners AS (
      ${unionParts.join("\nUNION\n")}
    )
    SELECT
      p.partner_name,
      (s.partner_name IS NOT NULL) AS is_configured
    FROM partners p
    LEFT JOIN agg_partner_settings s
      ON s.partner_name = p.partner_name
    ORDER BY p.partner_name ASC
  `;

  const r = await query(sql);

  return NextResponse.json({
    ok: true,
    partners: (r.rows || []).map((x: any) => ({
      partner_name: normalizeString(x.partner_name),
      is_configured: !!x.is_configured,
    })),
  });
}