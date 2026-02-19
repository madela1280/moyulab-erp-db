// app/api/sms/recompute/route.ts
//
// 통합관리 수정 직후 "즉시 반영"용: 특정 unified_id 1개를 재평가해서 sms_targets에 추가/탈락 반영
// POST /api/sms/recompute
// body: { unifiedId: number, baseDate?: "YYYY-MM-DD" }
//
// 동작:
// - unified 한 행을 가져옴
// - 3개 소카테고리 각각에 대해 "해당되면 upsert(pending 복귀), 아니면 excluded 처리"
// - success/fail 확정된 건은 제외 처리하지 않음(이력 보호)

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { SmsSubCategory } from "@/sms/types/sms.types";
import { decideSmsSubCategoryFromUnifiedRow } from "@/sms/rules/smsSubCategoryRules";
import { formatKoreanDateWithDow } from "@/sms/utils/formatKoreanDate";

function getKstTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeBaseDate(v: any): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function ymdToDateLocal(ymd: string) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

const ALL_SUBS: SmsSubCategory[] = ["대여첫안내", "만기3일전", "만기지남"];

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const unifiedId = Math.floor(Number(body?.unifiedId ?? 0));
    if (!Number.isFinite(unifiedId) || unifiedId <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_unifiedId" }, { status: 400 });
    }

    const baseDate = normalizeBaseDate(body?.baseDate) ?? getKstTodayYmd();
    const baseToday = ymdToDateLocal(baseDate);

    const r = await query(`SELECT id, data FROM unified WHERE id=$1`, [unifiedId]);
    if (!r.rows?.length) {
      return NextResponse.json({ ok: false, error: "unified_not_found" }, { status: 404 });
    }

    const data = (r.rows[0]?.data ?? {}) as Record<string, any>;

    const decision = decideSmsSubCategoryFromUnifiedRow(data, baseToday);

    // 결정된 subCategory만 "대상"으로, 나머지는 excluded 처리(단, 확정 success/fail은 보호)
    for (const sub of ALL_SUBS) {
      const isTarget = decision.subCategory === sub;

      if (isTarget) {
        const patch = {
          unified_id: unifiedId,
          sub_category: sub,
          base_date: baseDate,

          guide_name: norm(data["안내분류"]),
          recipient_name: norm(data["수취인명"]),
          phone1: norm(data["연락처1"]),
          phone2: norm(data["연락처2"]),
          address: norm(data["계약자주소"]),

          shipped_date: norm(data["택배발송일"]),
          start_date: norm(data["시작일"]),
          end_date: norm(data["종료일"]),
          return_request_date: norm(data["반납요청일"]),
          return_complete_date: norm(data["반납완료일"]),

          derived_status: decision.derivedStatus,
          end_date_display: formatKoreanDateWithDow(data["종료일"]),
        };

        await query(
          `
          INSERT INTO sms_targets (
            unified_id, sub_category, base_date,
            guide_name, recipient_name, phone1, phone2, address,
            shipped_date, start_date, end_date, return_request_date, return_complete_date,
            derived_status, end_date_display,
            target_status,
            updated_at
          ) VALUES (
            $1,$2,$3,
            $4,$5,$6,$7,$8,
            $9,$10,$11,$12,$13,
            $14,$15,
            'pending',
            now()
          )
          ON CONFLICT (unified_id, sub_category, base_date)
          DO UPDATE SET
            guide_name = EXCLUDED.guide_name,
            recipient_name = EXCLUDED.recipient_name,
            phone1 = EXCLUDED.phone1,
            phone2 = EXCLUDED.phone2,
            address = EXCLUDED.address,
            shipped_date = EXCLUDED.shipped_date,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            return_request_date = EXCLUDED.return_request_date,
            return_complete_date = EXCLUDED.return_complete_date,
            derived_status = EXCLUDED.derived_status,
            end_date_display = EXCLUDED.end_date_display,
            target_status = CASE
              WHEN sms_targets.target_status = 'excluded' THEN 'pending'
              ELSE sms_targets.target_status
            END,
            updated_at = now()
          `,
          [
            patch.unified_id,
            patch.sub_category,
            patch.base_date,
            patch.guide_name,
            patch.recipient_name,
            patch.phone1,
            patch.phone2,
            patch.address,
            patch.shipped_date,
            patch.start_date,
            patch.end_date,
            patch.return_request_date,
            patch.return_complete_date,
            patch.derived_status,
            patch.end_date_display,
          ]
        );
      } else {
        // 탈락: pending/sending/sent만 excluded로 (성공/실패 확정은 보호)
        await query(
          `
          UPDATE sms_targets
          SET target_status='excluded',
              updated_at=now()
          WHERE unified_id=$1
            AND sub_category=$2
            AND base_date=$3
            AND target_status IN ('pending','sending','sent')
          `,
          [unifiedId, sub, baseDate]
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/sms/recompute error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}