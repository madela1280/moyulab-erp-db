// app/api/sms/result/route.ts
//
// POST /api/sms/result
// body: { baseDate?: "YYYY-MM-DD", subCategory?: "대여첫안내"|"만기3일전"|"만기지남", limit?: number }
//
// 정책
// - sent/sending 상태의 대상에 대해 SENS "메시지 상세 조회"로 최종 성공/실패를 확정 저장한다.
// - 대상이 없으면 ok:true + 0건으로 종료(에러 아님)
// - 운영에서는 SMS_SEND_ENABLED=true 일 때만 동작(안전장치)

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { SmsSubCategory } from "@/sms/types/sms.types";
import { getAlimTalkStatus } from "@/lib/sens";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function normalizeSubCategory(v: any): SmsSubCategory | null {
  const s = String(v ?? "").trim();
  if (s === "대여첫안내" || s === "만기3일전" || s === "만기지남") return s;
  return null;
}

function normalizeBaseDate(v: any): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function getKstTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type Body = {
  baseDate?: string;
  subCategory?: SmsSubCategory | string;
  sub_category?: SmsSubCategory | string;
  limit?: number;
};

export async function POST(req: Request) {
  try {
    // ✅ 운영 안전장치: 발송 스위치가 켜져 있을 때만 결과확정도 허용
    if (process.env.NODE_ENV === "production") {
      const enabled = String(process.env.SMS_SEND_ENABLED ?? "").trim().toLowerCase();
      if (enabled !== "true") {
        return NextResponse.json(
          { ok: false, error: "result_disabled_by_env" },
          { status: 403 }
        );
      }
    }

    const serviceId = mustEnv("NCLOUD_SENS_BIZ_SERVICE_ID");

    const body = (await req.json().catch(() => ({}))) as Body;

    const baseDate = normalizeBaseDate(body?.baseDate) ?? getKstTodayYmd();
    const subCategory = normalizeSubCategory(body?.subCategory ?? body?.sub_category); // optional

    const limitRaw = Number(body?.limit ?? 500);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(2000, limitRaw)) : 500;

    const r = await query(
      `
      SELECT
        id,
        sub_category,
        last_message_id
      FROM sms_targets
      WHERE base_date = $1::date
        AND ($2::text IS NULL OR sub_category = $2::text)
        AND target_status IN ('sent','sending')
        AND NULLIF(btrim(COALESCE(last_message_id,'')), '') IS NOT NULL
      ORDER BY id ASC
      LIMIT $3
      `,
      [baseDate, subCategory ?? null, limit]
    );

    const rows = r.rows ?? [];
    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        baseDate,
        subCategory: subCategory ?? null,
        checked: 0,
        success: 0,
        fail: 0,
        processing: 0,
        errors: 0,
        message: "no targets to sync",
      });
    }

    let success = 0;
    let fail = 0;
    let processing = 0;
    let errors = 0;

    for (const row of rows) {
      const targetId = Number(row.id);
      const messageId = String(row.last_message_id);

      try {
        const st = await getAlimTalkStatus({ serviceId, messageId });

        if (st.status === "success") {
          await query(
            `
            UPDATE sms_targets
            SET target_status = 'success',
                last_result_code = $2,
                last_result_desc = $3,
                updated_at = now()
            WHERE id = $1
            `,
            [targetId, st.code ?? "0000", st.desc ?? ""]
          );
          success += 1;
          continue;
        }

        if (st.status === "fail") {
          await query(
            `
            UPDATE sms_targets
            SET target_status = 'fail',
                last_result_code = $2,
                last_result_desc = $3,
                updated_at = now()
            WHERE id = $1
            `,
            [targetId, st.code ?? "fail", st.desc ?? ""]
          );
          fail += 1;
          continue;
        }

        // processing: 상태는 유지하되, 마지막 조회코드/설명만 업데이트
        await query(
          `
          UPDATE sms_targets
          SET last_result_code = $2,
              last_result_desc = $3,
              updated_at = now()
          WHERE id = $1
          `,
          [targetId, st.code ?? "processing", st.desc ?? ""]
        );
        processing += 1;
      } catch (e: any) {
        await query(
          `
          UPDATE sms_targets
          SET last_result_code = 'result_error',
              last_result_desc = $2,
              updated_at = now()
          WHERE id = $1
          `,
          [targetId, String(e?.message ?? "result_error")]
        );
        errors += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      baseDate,
      subCategory: subCategory ?? null,
      checked: rows.length,
      success,
      fail,
      processing,
      errors,
    });
  } catch (e: any) {
    console.error("POST /api/sms/result error:", e);
    return NextResponse.json(
      { ok: false, error: "server", message: String(e?.message ?? "server") },
      { status: 500 }
    );
  }
}