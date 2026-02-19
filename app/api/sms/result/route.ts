// app/api/sms/result/route.ts
//
// 알림톡/대체발송(SMS/LMS) 결과를 조회해 DB에 확정 저장
// POST /api/sms/result
// body: { batchId?: string, baseDate?: string }
//
// 초기 버전(중요):
// - 실제 SENS 결과조회 API 스펙(알림톡 상태조회, SMS 상태조회)에 맞춰 구현해야 100% 확정 가능
// - 현재는 "조회 API 준비 전" 단계에서 동작 가능한 최소 골격만 제공한다.
// - sens.ts에 조회 함수(getAlimTalkStatus, getSmsStatus)를 붙이면 여기서 확정처리 로직을 완성할 수 있다.

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAlimTalkStatus, getSmsStatus } from "@/lib/sens";

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const batchId = String(body?.batchId ?? "").trim() || null;
    const baseDate = normalizeBaseDate(body?.baseDate) ?? getKstTodayYmd();

    const serviceId = process.env.NCLOUD_SENS_BIZ_SERVICE_ID || "";
    if (!serviceId) {
      return NextResponse.json({ ok: false, error: "missing_service_id" }, { status: 500 });
    }

    // 진행중 대상 조회(sent/sending)
    const r = await query(
      `
      SELECT
        t.id,
        t.last_message_id,
        t.last_failover_message_id,
        t.target_status,
        l.batch_id
      FROM sms_targets t
      LEFT JOIN LATERAL (
        SELECT batch_id
        FROM sms_send_logs
        WHERE target_id = t.id
        ORDER BY id DESC
        LIMIT 1
      ) l ON true
      WHERE t.base_date = $1
        AND t.target_status IN ('sending','sent')
        AND ($2::text IS NULL OR l.batch_id = $2)
      ORDER BY t.id ASC
      `,
      [baseDate, batchId]
    );

    const targets = r.rows ?? [];

    let success = 0;
    let fail = 0;
    let processing = 0;

    for (const t of targets) {
      const targetId = Number(t.id);
      const alimMessageId = String(t.last_message_id ?? "").trim();
      const failoverMessageId = String(t.last_failover_message_id ?? "").trim();

      if (!alimMessageId) {
        // 발송 로그/메시지ID가 없는 sent는 비정상 -> fail 처리
        await query(
          `
          UPDATE sms_targets
          SET target_status='fail',
              last_result_code='missing_message_id',
              last_result_desc='알림톡 messageId가 없습니다.',
              updated_at=now()
          WHERE id=$1
          `,
          [targetId]
        );
        fail += 1;
        continue;
      }

      // 1) 알림톡 결과 조회(템플릿/채널 정책에 따라 대체발송이 붙을 수 있음)
      const alim = await getAlimTalkStatus({ serviceId, messageId: alimMessageId });

      // alim.status: "success" | "fail" | "processing" (sens.ts에서 정규화한다고 가정)
      if (alim.status === "processing") {
        processing += 1;
        continue;
      }

      if (alim.status === "success") {
        await query(
          `
          UPDATE sms_targets
          SET target_status='success',
              last_result_code=$2,
              last_result_desc=$3,
              updated_at=now()
          WHERE id=$1
          `,
          [targetId, alim.code ?? "success", alim.desc ?? "성공"]
        );
        success += 1;
        continue;
      }

      // 알림톡 실패 -> failover가 있으면 SMS 결과까지 확정해야 최종 성공/실패 판단 가능
      const nextFailoverId = alim.failoverMessageId || failoverMessageId || "";

      if (!nextFailoverId) {
        await query(
          `
          UPDATE sms_targets
          SET target_status='fail',
              last_result_code=$2,
              last_result_desc=$3,
              updated_at=now()
          WHERE id=$1
          `,
          [targetId, alim.code ?? "fail", alim.desc ?? "알림톡 실패"]
        );
        fail += 1;
        continue;
      }

      // 2) SMS/LMS 대체발송 결과 조회
      const sms = await getSmsStatus({ serviceId, messageId: nextFailoverId });

      if (sms.status === "processing") {
        // 알림톡은 실패 확정이지만, SMS가 아직 처리중이면 processing 유지
        processing += 1;

        // failover id는 저장해 둔다(다음 동기화 때 재조회)
        await query(
          `
          UPDATE sms_targets
          SET last_failover_message_id=$2,
              last_result_code=$3,
              last_result_desc=$4,
              updated_at=now()
          WHERE id=$1
          `,
          [
            targetId,
            nextFailoverId,
            alim.code ?? "alimtalk_fail",
            alim.desc ?? "알림톡 실패(대체발송 진행중)",
          ]
        );
        continue;
      }

      if (sms.status === "success") {
        await query(
          `
          UPDATE sms_targets
          SET target_status='success',
              last_failover_message_id=$2,
              last_result_code=$3,
              last_result_desc=$4,
              updated_at=now()
          WHERE id=$1
          `,
          [
            targetId,
            nextFailoverId,
            sms.code ?? "sms_success",
            sms.desc ?? "대체발송 성공",
          ]
        );
        success += 1;
        continue;
      }

      // sms fail
      await query(
        `
        UPDATE sms_targets
        SET target_status='fail',
            last_failover_message_id=$2,
            last_result_code=$3,
            last_result_desc=$4,
            updated_at=now()
        WHERE id=$1
        `,
        [
          targetId,
          nextFailoverId,
          sms.code ?? "sms_fail",
          sms.desc ?? "대체발송 실패",
        ]
      );
      fail += 1;
    }

    return NextResponse.json({ ok: true, success, fail, processing });
  } catch (e) {
    console.error("POST /api/sms/result error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}