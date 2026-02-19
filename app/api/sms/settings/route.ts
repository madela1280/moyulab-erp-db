// app/api/sms/settings/route.ts
//
// 소카테고리×안내분류(guide_name) → SENS 템플릿 매핑 설정
// GET  /api/sms/settings  : 전체 목록
// PATCH /api/sms/settings : upsert 1건
//
// 초기 운영 가정:
// - guide_name=null 행은 "기본(default) 템플릿"으로 사용
// - 동일 (sub_category, guide_name) 조합은 1개만 존재

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { SmsSubCategory } from "@/sms/types/sms.types";

function normalizeSubCategory(v: any): SmsSubCategory | null {
  const s = String(v ?? "").trim();
  if (s === "대여첫안내" || s === "만기3일전" || s === "만기지남") return s;
  return null;
}

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

export async function GET() {
  try {
    const r = await query(
      `
      SELECT
        id,
        sub_category,
        guide_name,
        template_code,
        plus_friend_id,
        COALESCE(use_sms_failover, false) AS use_sms_failover,
        failover_from,
        template_body,
        buttons_json,
        updated_at
      FROM sms_template_map
      ORDER BY sub_category ASC, guide_name NULLS FIRST, id ASC
      `
    );

    return NextResponse.json({ ok: true, rows: r.rows ?? [] });
  } catch (e) {
    console.error("GET /api/sms/settings error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const sub_category = normalizeSubCategory(body?.sub_category ?? body?.subCategory);
    if (!sub_category) {
      return NextResponse.json({ ok: false, error: "invalid_sub_category" }, { status: 400 });
    }

    const guide_name = norm(body?.guide_name ?? body?.guideName);
    const template_code = String(body?.template_code ?? body?.templateCode ?? "").trim();
    const plus_friend_id = String(body?.plus_friend_id ?? body?.plusFriendId ?? "").trim();

    const use_sms_failover = !!body?.use_sms_failover;
    const failover_from = norm(body?.failover_from);

    const template_body = String(body?.template_body ?? "").trim(); // 승인 템플릿 원문(치환 전)
    const buttons_json = body?.buttons_json ?? null; // jsonb

    if (!template_code || !plus_friend_id) {
      return NextResponse.json(
        { ok: false, error: "missing_template_code_or_plus_friend_id" },
        { status: 400 }
      );
    }

    // template_body는 초기에는 필수로 두는 게 안전(발송 content를 이걸로 만들기 때문)
    if (!template_body) {
      return NextResponse.json({ ok: false, error: "missing_template_body" }, { status: 400 });
    }

    await query(
      `
      INSERT INTO sms_template_map (
        sub_category,
        guide_name,
        template_code,
        plus_friend_id,
        use_sms_failover,
        failover_from,
        template_body,
        buttons_json,
        updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        now()
      )
      ON CONFLICT (sub_category, guide_name)
      DO UPDATE SET
        template_code = EXCLUDED.template_code,
        plus_friend_id = EXCLUDED.plus_friend_id,
        use_sms_failover = EXCLUDED.use_sms_failover,
        failover_from = EXCLUDED.failover_from,
        template_body = EXCLUDED.template_body,
        buttons_json = EXCLUDED.buttons_json,
        updated_at = now()
      `,
      [
        sub_category,
        guide_name,
        template_code,
        plus_friend_id,
        use_sms_failover,
        failover_from,
        template_body,
        buttons_json ? JSON.stringify(buttons_json) : null,
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/sms/settings error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}