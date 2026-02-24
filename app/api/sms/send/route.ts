// app/api/sms/send/route.ts
//
// POST /api/sms/send
// body: { baseDate: "YYYY-MM-DD", subCategory: "대여첫안내"|"만기3일전"|"만기지남", limit?: number }
//
// ✅ 정책
// - production에서는 SMS_SEND_ENABLED === "true" 일 때만 발송 허용(1차 스위치)
// - baseDate + subCategory + pending 대상만 발송
// - pending -> sending 원자 전이 성공한 row만 발송(중복발송 방지)
// - 발송 요청 성공 시 sent로 저장(최종 성공/실패 확정은 /api/sms/result에서 처리 예정)
// - 템플릿 매핑: (sub_category, guide_name) 우선, 없으면 (sub_category, NULL) 기본 매핑
// - 변수 치환:
//   #{name} -> recipient_name
//   #{date} -> 첫번째는 start_date, 두번째는 end_date (순서 치환)

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { SmsSubCategory } from "@/sms/types/sms.types";
import { sendAlimTalk } from "@/app/lib/sens";

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

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function onlyDigitsPhone(v: any) {
  const s = String(v ?? "").trim();
  return s.replace(/[^\d]/g, "");
}

function fillTemplate(args: {
  template: string;
  name: string | null;
  startDate: string | null;
  endDate: string | null;
}) {
  let out = String(args.template ?? "");

  // #{name}
  out = out.replace(/#\{name\}/g, args.name ?? "");

  // #{date} (순서 치환)
  let i = 0;
  out = out.replace(/#\{date\}/g, () => {
    i += 1;
    if (i === 1) return args.startDate ?? "";
    if (i === 2) return args.endDate ?? "";
    return args.endDate ?? "";
  });

  return out;
}

type Body = {
  baseDate?: string;
  subCategory?: SmsSubCategory | string;
  sub_category?: SmsSubCategory | string;
  limit?: number;
};

export async function POST(req: Request) {
  try {
    // ✅ 운영 발송 스위치(1차 안전장치)
    if (process.env.NODE_ENV === "production") {
      const enabled = String(process.env.SMS_SEND_ENABLED ?? "").trim().toLowerCase();
      if (enabled !== "true") {
        return NextResponse.json(
          {
            ok: false,
            error: "send_disabled_by_env",
            message: "Set SMS_SEND_ENABLED=true to enable sending in production.",
          },
          { status: 403 }
        );
      }
    }

    const serviceId = mustEnv("NCLOUD_SENS_BIZ_SERVICE_ID");

    const body = (await req.json().catch(() => ({}))) as Body;

    const baseDate = normalizeBaseDate(body?.baseDate);
    if (!baseDate) {
      return NextResponse.json({ ok: false, error: "invalid_baseDate" }, { status: 400 });
    }

    const subCategory = normalizeSubCategory(body?.subCategory ?? body?.sub_category);
    if (!subCategory) {
      return NextResponse.json({ ok: false, error: "invalid_subCategory" }, { status: 400 });
    }

    const limitRaw = Number(body?.limit ?? 500);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(2000, limitRaw)) : 500;

    // ✅ 발송 대상 후보 조회(pending)
    const cand = await query(
      `
      SELECT
        id,
        unified_id,
        sub_category,
        base_date,
        guide_name,
        recipient_name,
        phone1,
        start_date,
        end_date
      FROM sms_targets
      WHERE base_date = $1::date
        AND sub_category = $2
        AND target_status = 'pending'
      ORDER BY id ASC
      LIMIT $3
      `,
      [baseDate, subCategory, limit]
    );

    const rows = cand.rows ?? [];

    if (!rows.length) {
      return NextResponse.json({
        ok: true,
        baseDate,
        subCategory,
        picked: 0,
        sent: 0,
        failed: 0,
        message: "no pending targets",
      });
    }

    const batchId =
      (globalThis.crypto as any)?.randomUUID?.() ??
      `batch_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    let sent = 0;
    let failed = 0;
    const results: any[] = [];

    for (const t of rows) {
      const targetId = Number(t.id);

      // 1) pending -> sending 원자 전이
      const lock = await query(
        `
        UPDATE sms_targets
        SET target_status = 'sending',
            updated_at = now()
        WHERE id = $1
          AND target_status = 'pending'
        RETURNING id
        `,
        [targetId]
      );

      if (!lock.rows?.length) {
        // 다른 프로세스가 먼저 잡았거나 상태 변경됨
        results.push({ targetId, ok: false, skipped: true, reason: "not_pending" });
        continue;
      }

      try {
        const guide = norm(t.guide_name);

        // 2) 템플릿 매핑 조회: guide 우선, 없으면 default(null)
        const mapR = await query(
          `
          SELECT
            template_code,
            plus_friend_id,
            COALESCE(use_sms_failover, false) AS use_sms_failover,
            failover_from,
            template_body,
            buttons_json
          FROM sms_template_map
          WHERE sub_category = $1
            AND (
              ($2::text IS NOT NULL AND guide_name = $2::text)
              OR (guide_name IS NULL)
            )
          ORDER BY
            CASE
              WHEN $2::text IS NOT NULL AND guide_name = $2::text THEN 0
              WHEN guide_name IS NULL THEN 1
              ELSE 2
            END ASC
          LIMIT 1
          `,
          [subCategory, guide]
        );

        if (!mapR.rows?.length) throw new Error("missing_template_map");

        const m = mapR.rows[0];
        const templateCode = String(m.template_code ?? "").trim();
        const plusFriendId = String(m.plus_friend_id ?? "").trim();
        const templateBody = String(m.template_body ?? "").trim();

        if (!templateCode || !plusFriendId || !templateBody) throw new Error("invalid_template_map");

        // 3) 치환된 content 생성
        const content = fillTemplate({
          template: templateBody,
          name: norm(t.recipient_name),
          startDate: norm(t.start_date),
          endDate: norm(t.end_date),
        });

        // 4) 수신번호
        const to = onlyDigitsPhone(t.phone1);
        if (!to) throw new Error("missing_phone1");

        const msg: any = { to, content };

        // 5) (옵션) 대체발송
        const useFailover = !!m.use_sms_failover;
        const failoverFrom = norm(m.failover_from);
        if (useFailover && failoverFrom) {
          msg.useSmsFailover = true;
          msg.failoverConfig = {
            type: "SMS",
            from: String(failoverFrom),
            content: content,
          };
        }

        // 6) 발송
        const resp = await sendAlimTalk({
          serviceId,
          plusFriendId,
          templateCode,
          messages: [msg],
        });

        const requestId = resp?.requestId ?? null;
        const messageId = resp?.messages?.[0]?.messageId ?? null;

        // 7) 로그 저장
        await query(
          `
          INSERT INTO sms_send_logs (
            batch_id, target_id, unified_id,
            sub_category, base_date,
            request_id, message_id,
            status_code, status_name,
            request_status_code, request_status_desc
          ) VALUES (
            $1,$2,$3,
            $4,$5,
            $6,$7,
            $8,$9,
            $10,$11
          )
          `,
          [
            batchId,
            targetId,
            Number(t.unified_id),
            String(t.sub_category),
            t.base_date,
            requestId,
            messageId,
            String(resp?.statusCode ?? ""),
            String(resp?.statusName ?? ""),
            String(resp?.messages?.[0]?.requestStatusCode ?? ""),
            String(resp?.messages?.[0]?.requestStatusDesc ?? ""),
          ]
        );

        // 8) 상태 업데이트(요청 성공=sent)
        await query(
          `
          UPDATE sms_targets
          SET target_status = 'sent',
              last_request_id = $2,
              last_message_id = $3,
              last_result_code = $4,
              last_result_desc = $5,
              updated_at = now()
          WHERE id = $1
          `,
          [
            targetId,
            requestId,
            messageId,
            String(resp?.messages?.[0]?.requestStatusCode ?? ""),
            String(resp?.messages?.[0]?.requestStatusDesc ?? ""),
          ]
        );

        sent += 1;
        results.push({ targetId, ok: true, to, requestId, messageId });
      } catch (err: any) {
        const desc = String(err?.message ?? "send_failed");

        await query(
          `
          UPDATE sms_targets
          SET target_status = 'fail',
              last_result_code = 'send_error',
              last_result_desc = $2,
              updated_at = now()
          WHERE id = $1
          `,
          [targetId, desc]
        );

        failed += 1;
        results.push({ targetId, ok: false, error: desc });
      }
    }

    return NextResponse.json({
      ok: true,
      batchId,
      baseDate,
      subCategory,
      picked: rows.length,
      sent,
      failed,
      results,
    });
  } catch (e: any) {
    console.error("POST /api/sms/send error:", e);
    return NextResponse.json(
      { ok: false, error: "server", message: String(e?.message ?? "server") },
      { status: 500 }
    );
  }
}