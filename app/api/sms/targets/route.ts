// app/api/sms/targets/route.ts
//
// 집계된 문자 대상 리스트 조회
// GET /api/sms/targets?subCategory=대여첫안내|만기3일전|만기지남&baseDate=YYYY-MM-DD(optional)

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { SmsSubCategory } from "@/sms/types/sms.types";

function getKstTodayYmd() {
  // "YYYY-MM-DD" (en-CA 포맷은 ISO와 동일한 날짜 형태를 줌)
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return s;
}

function normalizeSubCategory(v: string | null): SmsSubCategory | null {
  const s = String(v ?? "").trim();
  if (s === "대여첫안내" || s === "만기3일전" || s === "만기지남") return s;
  return null;
}

function normalizeBaseDate(v: string | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;

    const subCategory = normalizeSubCategory(sp.get("subCategory"));
    if (!subCategory) {
      return NextResponse.json(
        { ok: false, error: "invalid_subCategory" },
        { status: 400 }
      );
    }

    const baseDate = normalizeBaseDate(sp.get("baseDate")) ?? getKstTodayYmd();

    const r = await query(
      `
      SELECT
        id,
        unified_id,
        sub_category,
        base_date,
        guide_name AS "안내분류",
        recipient_name AS "수취인명",
        phone1 AS "연락처1",
        phone2 AS "연락처2",
        address AS "계약자주소",
        shipped_date AS "택배발송일",
        start_date AS "시작일",
        end_date AS "종료일",
        return_request_date AS "반납요청일",
        return_complete_date AS "반납완료일",
        derived_status AS "상태",
        end_date_display AS "만기일_표시문자",
        target_status,
        last_request_id,
        last_message_id,
        last_failover_message_id,
        last_result_code,
        last_result_desc,
        created_at,
        updated_at
      FROM sms_targets
      WHERE sub_category = $1
        AND base_date = $2
        AND target_status <> 'excluded'
      ORDER BY id ASC
      `,
      [subCategory, baseDate]
    );

    return NextResponse.json({
      ok: true,
      subCategory,
      baseDate,
      rows: r.rows,
    });
  } catch (e) {
    console.error("GET /api/sms/targets error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}