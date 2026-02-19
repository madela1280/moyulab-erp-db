// app/api/sms/send/route.ts
//
// 집계된 대상(sms_targets)을 기준으로 SENS 알림톡 자동발송 요청
// POST /api/sms/send
// body: { subCategory, baseDate?, targetIds?, dryRun? }
//
// 주의(초기 버전):
// - 템플릿(content)은 "승인된 템플릿 문구와 완전 일치"해야 함.
// - 이 API는 sms_template_map에 template_body(템플릿 원문)와 필요 시 buttons_json 등을 저장해두고
//   대상자의 값으로 치환하여 최종 content를 만들어 전송하는 방식으로 구성한다.

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { SmsSubCategory } from "@/sms/types/sms.types";
import { formatKoreanDateWithDow } from "@/sms/utils/formatKoreanDate";
import { sendAlimTalk } from "@/lib/sens";

function getKstTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

function normalizeIds(v: any): number[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return null;
  const ids = v
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.floor(n));

  if (ids.length !== v.length) return null;
  return Array.from(new Set(ids));
}

function normText(v: any) {
  const s = String(v ?? "").trim();
  return s;
}

function safePhone(v: any) {
  // 숫자만
  return normText(v).replace(/[^\d]/g, "");
}

function replaceAll(content: string, token: string, value: string) {
  return content.split(token).join(value);
}

/**
 * 템플릿 원문(template_body)에 대상 row 값을 치환해서 최종 content 생성
 * - 실제 운영에선 "템플릿별 치환 키"를 더 엄격히 관리해야 함.
 */
function buildAlimTalkContent(args: {
  templateBody: string;
  recipientName: string;
  endDateDisplay: string;
  endDateRaw: any;
}) {
  const name = args.recipientName || "";
  const endDisplay =
    args.endDateDisplay || formatKoreanDateWithDow(args.endDateRaw) || "";

  let out = String(args.templateBody ?? "");

  // 대표 케이스: "#{날짜,요일}"
  out = replaceAll(out, "#{날짜,요일}", endDisplay);

  // (확장 여지) 이름 변수 등을 쓰는 템플릿이 있으면 여기서 추가
  out = replaceAll(out, "#{이름}", name);
  out = replaceAll(out, "#{수취인명}", name);

  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const subCategory = normalizeSubCategory(body?.subCategory);
    if (!subCategory) {
      return NextResponse.json({ ok: false, error: "invalid_subCategory" }, { status: 400 });
    }

    const baseDate = normalizeBaseDate(body?.baseDate) ?? getKstTodayYmd();
    const targetIds = normalizeIds(body?.targetIds);
    const dryRun = !!body?.dryRun;

    // 1) 발송 대상 조회 (기본: pending)
    const targetsR = await query(
      `
      SELECT
        t.id,
        t.unified_id,
        t.sub_category,
        t.base_date,
        t.guide_name,
        t.recipient_name,
        t.phone1,
        t.phone2,
        t.address,
        t.start_date,
        t.end_date,
        t.end_date_display,
        t.target_status
      FROM sms_targets t
      WHERE t.sub_category = $1
        AND t.base_date = $2
        AND t.target_status = 'pending'
        AND ($3::int[] IS NULL OR t.id = ANY($3::int[]))
      ORDER BY t.id ASC
      `,
      [subCategory, baseDate, targetIds]
    );

    const targets = targetsR.rows ?? [];
    if (!targets.length) {
      return NextResponse.json({
        ok: true,
        batchId: null,
        requestedCount: 0,
        failedCount: 0,
      });
    }

    // 2) 템플릿 매핑 로딩
    // - 우선순위: guide_name 정확히 일치 > guide_name IS NULL (default)
    // - 테이블에 template_body(text), buttons_json(jsonb) 컬럼이 있다고 가정(없으면 null로 처리됨)
    const mapsR = await query(
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
        buttons_json
      FROM sms_template_map
      WHERE sub_category = $1
      `,
      [subCategory]
    );

    const maps = mapsR.rows ?? [];

    function pickMap(guideName: string | null) {
      const g = normText(guideName || "");
      const exact = maps.find((m: any) => normText(m?.guide_name) === g && g);
      if (exact) return exact;
      const def = maps.find((m: any) => m?.guide_name === null);
      return def ?? null;
    }

    // 3) 대상별 메시지 생성 + 검증
    const serviceId = process.env.NCLOUD_SENS_BIZ_SERVICE_ID || "";
    if (!serviceId && !dryRun) {
      return NextResponse.json({ ok: false, error: "missing_service_id" }, { status: 500 });
    }

    const batchId =
      (globalThis as any).crypto?.randomUUID?.() ??
      // node crypto.randomUUID()
      (await import("crypto")).randomUUID();

    let failedCount = 0;
    let requestedCount = 0;

    // dryRun에서는 외부 호출 없이 검증만 수행
    const errors: Array<{ targetId: number; error: string }> = [];

    for (const t of targets) {
      const phone = safePhone(t?.phone1);
      const recipientName = normText(t?.recipient_name);
      const guideName = t?.guide_name ? String(t.guide_name) : null;

      if (!phone) {
        failedCount += 1;
        errors.push({ targetId: Number(t.id), error: "missing_phone1" });
        continue;
      }

      const map = pickMap(guideName);
      if (!map) {
        failedCount += 1;
        errors.push({ targetId: Number(t.id), error: "missing_template_map" });
        continue;
      }

      const templateBody = normText(map?.template_body);
      if (!templateBody) {
        failedCount += 1;
        errors.push({ targetId: Number(t.id), error: "missing_template_body" });
        continue;
      }

      const content = buildAlimTalkContent({
        templateBody,
        recipientName,
        endDateDisplay: normText(t?.end_date_display),
        endDateRaw: t?.end_date,
      });

      // 기본적인 “템플릿 일치” 검증은 실제로는 SENS가 판단하므로,
      // 여기서는 빈문자열/치환 실패 정도만 막는다.
      if (!content.trim()) {
        failedCount += 1;
        errors.push({ targetId: Number(t.id), error: "empty_content" });
        continue;
      }

      requestedCount += 1;

      if (dryRun) continue;

      // 4) 발송 전 상태 변경(sending) + 로그 생성
      await query(
        `
        UPDATE sms_targets
        SET target_status='sending',
            updated_at=now()
        WHERE id=$1
          AND target_status='pending'
        `,
        [Number(t.id)]
      );

      const plusFriendId = String(map.plus_friend_id || "");
      const templateCode = String(map.template_code || "");
      const useSmsFailover = !!map.use_sms_failover;
      const failoverFrom = map.failover_from ? String(map.failover_from) : null;

      // 5) SENS 발송
      try {
        const resp = await sendAlimTalk({
          serviceId,
          plusFriendId,
          templateCode,
          messages: [
            {
              to: phone,
              content,
              useSmsFailover,
              failoverConfig:
                useSmsFailover && failoverFrom
                  ? {
                      from: failoverFrom,
                      // content 미지정 시 알림톡 content가 default로 들어가지만,
                      // 여기서는 명시해서 운영 혼선을 줄임
                      content,
                    }
                  : undefined,
              // buttons는 템플릿이 요구할 수 있으므로 map에 있으면 그대로 전달
              buttons: map.buttons_json ?? undefined,
            },
          ],
        });

        const requestId = String(resp?.requestId ?? "");
        const messageId = String(resp?.messages?.[0]?.messageId ?? "");
        const statusCode = String(resp?.statusCode ?? "");
        const statusName = String(resp?.statusName ?? "");
        const reqCode = String(resp?.messages?.[0]?.requestStatusCode ?? "");
        const reqDesc = String(resp?.messages?.[0]?.requestStatusDesc ?? "");

        // 6) 로그 저장 + 대상 row에 추적값 기록
        await query(
          `
          INSERT INTO sms_send_logs (
            batch_id, target_id, unified_id, sub_category, base_date,
            request_id, message_id, status_code, status_name,
            request_status_code, request_status_desc,
            created_at
          ) VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,
            $10,$11,
            now()
          )
          `,
          [
            batchId,
            Number(t.id),
            Number(t.unified_id),
            subCategory,
            baseDate,
            requestId || null,
            messageId || null,
            statusCode || null,
            statusName || null,
            reqCode || null,
            reqDesc || null,
          ]
        );

        await query(
          `
          UPDATE sms_targets
          SET
            target_status = 'sent',
            last_request_id = $2,
            last_message_id = $3,
            last_result_code = $4,
            last_result_desc = $5,
            updated_at = now()
          WHERE id = $1
          `,
          [
            Number(t.id),
            requestId || null,
            messageId || null,
            reqCode || null,
            reqDesc || null,
          ]
        );
      } catch (e: any) {
        failedCount += 1;

        const msg = String(e?.message || e || "sens_send_failed");

        await query(
          `
          UPDATE sms_targets
          SET
            target_status = 'fail',
            last_result_code = 'send_error',
            last_result_desc = $2,
            updated_at = now()
          WHERE id = $1
          `,
          [Number(t.id), msg.slice(0, 500)]
        );

        await query(
          `
          INSERT INTO sms_send_logs (
            batch_id, target_id, unified_id, sub_category, base_date,
            request_id, message_id, status_code, status_name,
            request_status_code, request_status_desc,
            created_at
          ) VALUES (
            $1,$2,$3,$4,$5,
            NULL,NULL,NULL,'fail',
            'send_error',$6,
            now()
          )
          `,
          [
            batchId,
            Number(t.id),
            Number(t.unified_id),
            subCategory,
            baseDate,
            msg.slice(0, 500),
          ]
        );
      }
    }

    return NextResponse.json({
      ok: true,
      batchId,
      requestedCount,
      failedCount,
      ...(dryRun ? { dryRun: true, errors } : {}),
    });
  } catch (e) {
    console.error("POST /api/sms/send error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}