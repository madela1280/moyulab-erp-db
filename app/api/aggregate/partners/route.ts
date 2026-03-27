import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

function normalizePartnerAlias(name: string) {
  const s = String(name ?? "").trim();

  // 보건소 계열(예: 영통구/권선구/장안구...)은 공통 키 "보건소"로도 매핑 가능하게
  if (s.endsWith("구") || s.endsWith("시") || s.endsWith("군")) return "보건소";

  return s;
}

// ✅ 거래처 목록 생성 규칙:
// - 거래처분류가 "조리원*" 으로 시작하면 partner_name = 수취인명(비어있으면 거래처분류로 fallback)
// - 그 외는 partner_name = 거래처분류
function partnerKeyExpr(jsonCol: string) {
  return `
    CASE
      WHEN trim(COALESCE(${jsonCol}->>'거래처분류','')) LIKE '조리원%' THEN
        COALESCE(
          NULLIF(trim(COALESCE(${jsonCol}->>'수취인명','')), ''),
          trim(COALESCE(${jsonCol}->>'거래처분류',''))
        )
      ELSE trim(COALESCE(${jsonCol}->>'거래처분류',''))
    END
  `;
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
    SELECT DISTINCT partner_name
    FROM (
      SELECT ${partnerKeyExpr("u.data")} AS partner_name
      FROM unified u
    ) t
    WHERE trim(COALESCE(t.partner_name,'')) <> ''
  `);

  // 2) 회수완료 테이블(존재하는 경우만)
  for (const t of existingTables) {
    // table name is from allowlist(candidates) -> safe to interpolate
    unionParts.push(`
      SELECT DISTINCT partner_name
      FROM (
        SELECT ${partnerKeyExpr("x.data")} AS partner_name
        FROM ${t} x
      ) t
      WHERE trim(COALESCE(t.partner_name,'')) <> ''
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

  const rawPartners = (r.rows || []).map((x: any) => ({
    partner_name: normalizeString(x.partner_name),
    is_configured: !!x.is_configured,
  }));

  // 표시는 원본 유지, 내부 정렬/중복 판단은 alias 기준도 함께 반영
  const seen = new Set<string>();
  const partners = rawPartners.filter((p) => {
    const key = `${p.partner_name}||${normalizePartnerAlias(p.partner_name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json({
    ok: true,
    partners,
  });
}