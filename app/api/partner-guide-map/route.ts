import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * 거래처 -> 안내분류 매핑 관리 API
 *
 * 필요 DB 테이블(1회 생성):
 *
 * CREATE TABLE IF NOT EXISTS partner_guide_map (
 *   partner_name text PRIMARY KEY,
 *   guide_name text,
 *   updated_by text,
 *   updated_at timestamptz NOT NULL DEFAULT now()
 * );
 *
 * 정책:
 * - PATCH/DELETE로 매핑이 바뀌면, unified 테이블에서 해당 거래처(거래처분류)를 가진 모든 행의 안내분류를 즉시 일괄 반영
 * - 안내분류 값은 저장형(문자열 or null)으로 유지
 */

function norm(v: any) {
  return String(v ?? "").trim();
}

async function applyGuideToUnifiedRows(partner_name: string, guide_name: string | null) {
  const p = norm(partner_name);
  if (!p) return;

  // ✅ partner_name과 일치하는 통합관리 행들의 "안내분류"를 매핑값으로 overwrite
  // - guide_name이 null이면 안내분류는 json null로 저장(그리드에서는 ""로 표시됨)
  await query(
    `
    UPDATE unified
    SET data =
      CASE
        WHEN $2::text IS NULL THEN jsonb_set(data, '{안내분류}', 'null'::jsonb, true)
        ELSE jsonb_set(data, '{안내분류}', to_jsonb($2::text), true)
      END
    WHERE btrim(COALESCE(data->>'거래처분류','')) = $1
    `,
    [p, guide_name]
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const partner = norm(url.searchParams.get("partner"));

  if (partner) {
    const r = await query(
      `
      SELECT partner_name, guide_name, updated_by, updated_at
      FROM partner_guide_map
      WHERE partner_name=$1
      `,
      [partner]
    );
    const row = r.rows?.[0] ?? null;
    return NextResponse.json({
      mapping: row
        ? {
            partner_name: String(row.partner_name ?? ""),
            guide_name: row.guide_name ?? null,
            updated_by: row.updated_by ?? null,
            updated_at: row.updated_at ?? null,
          }
        : null,
    });
  }

  const r = await query(
    `
    SELECT partner_name, guide_name, updated_by, updated_at
    FROM partner_guide_map
    ORDER BY partner_name ASC
    `
  );

  return NextResponse.json({
    mappings: (r.rows || []).map((x: any) => ({
      partner_name: String(x.partner_name ?? ""),
      guide_name: x.guide_name ?? null,
      updated_by: x.updated_by ?? null,
      updated_at: x.updated_at ?? null,
    })),
  });
}

/**
 * PATCH: partner -> guide 매핑 설정
 * body: { partner_name: string, guide_name: string | null | "" }
 */
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const partner_name = norm(body?.partner_name);
  const rawGuide = body?.guide_name;

  if (!partner_name) return NextResponse.json({ error: "INVALID_PARTNER" }, { status: 400 });

  const guide_name = norm(rawGuide);
  const guideValue = guide_name ? guide_name : null;

  // upsert
  await query(
    `
    INSERT INTO partner_guide_map (partner_name, guide_name, updated_by)
    VALUES ($1, $2, $3)
    ON CONFLICT (partner_name) DO UPDATE
      SET guide_name = EXCLUDED.guide_name,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
    `,
    [partner_name, guideValue, user.username]
  );

  // ✅ 통합관리(unified)에도 즉시 반영
  await applyGuideToUnifiedRows(partner_name, guideValue);

  return NextResponse.json({ ok: true, partner_name, guide_name: guideValue });
}

/**
 * DELETE: 매핑 삭제(=비우기)
 * body: { partner_name: string }
 */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const partner_name = norm(body?.partner_name);

  if (!partner_name) return NextResponse.json({ error: "INVALID_PARTNER" }, { status: 400 });

  await query(`DELETE FROM partner_guide_map WHERE partner_name=$1`, [partner_name]);

  // ✅ 매핑 삭제는 통합관리 안내분류도 비움(null)으로 즉시 반영
  await applyGuideToUnifiedRows(partner_name, null);

  return NextResponse.json({ ok: true, partner_name });
}