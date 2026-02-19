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
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(y, mo - 1, d);
}

function norm(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

const ALL_SUBS: SmsSubCategory[] = ["대여첫안내", "만기3일전", "만기지남"];

type UnifiedRow = { id: number; data: Record<string, any> };

type AggregateMode = "base" | "incremental";

function normalizeMode(v: any): AggregateMode {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "incremental" || s === "inc" || s === "evening" || s === "19") return "incremental";
  return "base";
}

/**
 * POST /api/sms/aggregate
 * body: { baseDate?: "YYYY-MM-DD", mode?: "base"|"incremental" }
 *
 * 운영 의도:
 * - base(05시): 당일 발송대상 전체 집계 + (필요 시) 탈락 excluded 처리
 * - incremental(19시): 05시 집계 이후 새로 "대상에 들어온 사람"만 추가 집계
 *   - 기존 대상은 건드리지 않는다(추가만)
 *   - 단, 과거에 excluded로 남아있던 행이 다시 대상이 되면 pending으로만 복귀(예외 허용)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const baseDate = normalizeBaseDate(body?.baseDate) ?? getKstTodayYmd();
    const baseToday = ymdToDateLocal(baseDate);
    const mode = normalizeMode(body?.mode);

    // ✅ 후보만 최소로 가져오기:
    // - 연락처1이 있어야 발송 대상이 될 수 있음
    // - 대여첫안내(시작일=baseDate) 또는 종료일이 있는 행(만기 계산 후보)
    const r = await query(
      `
      SELECT id, data
      FROM unified
      WHERE
        NULLIF(btrim(COALESCE(data->>'연락처1','')), '') IS NOT NULL
        AND (
          btrim(COALESCE(data->>'시작일','')) = $1
          OR NULLIF(btrim(COALESCE(data->>'종료일','')), '') IS NOT NULL
        )
      ORDER BY id ASC
      `,
      [baseDate]
    );

    const unifiedRows = (r.rows ?? []) as UnifiedRow[];

    // base 모드에서만 "이번 집계 포함 목록"을 모아 excluded 처리에 사용
    const matchBySub = new Map<SmsSubCategory, number[]>();
    ALL_SUBS.forEach((s) => matchBySub.set(s, []));

    let upserted = 0;

    for (const row of unifiedRows) {
      const data = row?.data ?? {};
      const decision = decideSmsSubCategoryFromUnifiedRow(data, baseToday);
      const sub = decision.subCategory;
      if (!sub) continue;

      if (mode === "base") {
        matchBySub.get(sub)!.push(row.id);
      }

      const patch = {
        unified_id: row.id,
        sub_category: sub,
        base_date: baseDate,

        // snapshot
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

      if (mode === "base") {
        // ✅ base(05시): upsert로 전체 스냅샷을 만든다.
        // - excluded -> pending 복귀 허용
        // - sending/sent/success/fail 등은 유지(집계로 상태 되돌리지 않음)
        const u = await query(
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
          RETURNING 1
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

        if (u.rows?.length) upserted += 1;
        continue;
      }

      // ✅ incremental(19시): "추가만" 원칙
      // - 이미 존재하는 대상(pending/sending/sent/success/fail)은 건드리지 않음
      // - 단, 과거 excluded로 남아있던 행이 다시 대상이 되면 pending으로만 복귀(예외)
      const u2 = await query(
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
          target_status = 'pending',
          updated_at = now()
        WHERE sms_targets.target_status = 'excluded'
        RETURNING 1
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

      // INSERT 되거나(excluded->pending update 포함) rows가 생기면 upserted 증가로 집계
      if (u2.rows?.length) upserted += 1;
    }

    // ✅ base 모드에서만 excluded 처리(스냅샷 정리)
    let excluded = 0;

    if (mode === "base") {
      for (const sub of ALL_SUBS) {
        const ids = matchBySub.get(sub)!;

        // 매칭이 0이면 baseDate+sub 전체를 excluded로 만들되,
        // success/fail 확정은 보호하고, pending/sending/sent만 대상으로 제한
        if (!ids.length) {
          const rr = await query(
            `
            UPDATE sms_targets
            SET target_status = 'excluded',
                updated_at = now()
            WHERE base_date = $1
              AND sub_category = $2
              AND target_status IN ('pending','sending','sent')
            RETURNING 1
            `,
            [baseDate, sub]
          );
          excluded += rr.rows?.length ?? 0;
          continue;
        }

        const rr = await query(
          `
          UPDATE sms_targets
          SET target_status = 'excluded',
              updated_at = now()
          WHERE base_date = $1
            AND sub_category = $2
            AND target_status IN ('pending','sending','sent')
            AND unified_id <> ALL($3::int[])
          RETURNING 1
          `,
          [baseDate, sub, ids]
        );
        excluded += rr.rows?.length ?? 0;
      }
    }

    return NextResponse.json({
      ok: true,
      baseDate,
      mode,
      upserted,
      excluded,
    });
  } catch (e) {
    console.error("POST /api/sms/aggregate error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}