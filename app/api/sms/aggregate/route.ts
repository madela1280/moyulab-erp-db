import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { SmsSubCategory } from "@/sms/types/sms.types";
import { decideSmsSubCategoryFromUnifiedRow } from "@/sms/rules/smsSubCategoryRules";
import { isSmsExcludedFromUnifiedRow } from "@/sms/rules/smsExcludeRules";
import { formatKoreanDateWithDow } from "@/sms/utils/formatKoreanDate";

function getKstTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getKstHour(): number {
  const hh = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  const n = Number(hh);
  return Number.isFinite(n) ? n : -1;
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

const ALL_SUBS: SmsSubCategory[] = ["대여첫안내", "만기3일전", "만기3일전(공휴일)", "만기지남"];

type UnifiedRow = { id: number; data: Record<string, any> };

// ✅ sms_targets/sms_template_map의 sub_category CHECK 제약을 새 카테고리까지 허용하도록 확장.
// (unified/locks 스키마와 무관, 기존 3개 값은 그대로 포함되므로 기존 카테고리 동작에 영향 없음)
async function ensureSubCategoryConstraint() {
  const allowed = ALL_SUBS.map((s) => `'${s}'`).join(",");

  for (const table of ["sms_targets", "sms_template_map"]) {
    await query(
      `
      DO $$
      DECLARE
        con_name text;
      BEGIN
        SELECT conname INTO con_name
        FROM pg_constraint
        WHERE conrelid = '${table}'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%sub_category%';

        IF con_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE ${table} DROP CONSTRAINT %I', con_name);
        END IF;

        ALTER TABLE ${table}
          ADD CONSTRAINT ${table}_sub_category_check
          CHECK (sub_category IN (${allowed}));
      END $$;
      `
    );
  }
}

// ✅ holidays 테이블(YYYY-MM-DD Set). 실패해도 빈 Set으로 폴백(공휴일 구분만 안 될 뿐 집계 자체는 계속됨)
async function getHolidaySet(): Promise<Set<string>> {
  try {
    const r = await query(`SELECT to_char(date, 'YYYY-MM-DD') AS date FROM holidays`);
    return new Set((r.rows ?? []).map((row: any) => String(row.date)));
  } catch {
    return new Set();
  }
}

// ✅ 만기지남 전용: "역대 한 번이라도" 발송(sent/success) 확정된 unified_id는 base_date와 무관하게
// 다시는 집계 대상에 포함하지 않는다(매일 재집계되어 중복 발송되는 것 방지).
async function getAlreadyNotifiedOverdueIds(): Promise<Set<number>> {
  const r = await query(
    `
    SELECT DISTINCT unified_id
    FROM sms_targets
    WHERE sub_category = '만기지남'
      AND target_status IN ('sent','success')
    `
  );
  return new Set((r.rows ?? []).map((row: any) => Number(row.unified_id)));
}

/**
 * POST /api/sms/aggregate
 * body: { baseDate?: "YYYY-MM-DD" }
 *
 * 정책(단순화 + 보호장치):
 * - 집계는 "05시 1회"만 허용한다.
 * - 19시/수동/새로고침 등으로 05시 집계 결과가 변형되는 것을 방지하기 위해,
 *   (운영 환경에서는) KST 기준 "05시"가 아니면 집계를 거부한다.
 *
 * 예외:
 * - 개발 환경(NODE_ENV !== "production")에서는 테스트를 위해 시간 제한을 적용하지 않는다.
 */
export async function POST(req: Request) {
  try {
    // ✅ 운영 환경에서는 05시(KST)에만 허용
    if (process.env.NODE_ENV === "production") {
      const kstHour = getKstHour();
      if (kstHour !== 5) {
        return NextResponse.json(
          {
            ok: false,
            error: "forbidden_time",
            message: "sms aggregate is allowed only at 05:00 (KST) in production.",
          },
          { status: 403 }
        );
      }
    }

    const body = await req.json().catch(() => ({}));
    const baseDate = normalizeBaseDate(body?.baseDate) ?? getKstTodayYmd();
    const baseToday = ymdToDateLocal(baseDate);

    await ensureSubCategoryConstraint();

    const holidays = await getHolidaySet();
    // ✅ 만기지남: 오늘(집계 기준일)이 공휴일이면 이번 회차는 만기지남을 통째로 건너뛴다.
    // (다음 영업일 집계에서 밀린 것까지 자동으로 포함되어 처리됨 — 별도 보정 로직 불필요)
    const isBaseDateHoliday = holidays.has(baseDate);
    const alreadyNotifiedOverdueIds = isBaseDateHoliday
      ? new Set<number>()
      : await getAlreadyNotifiedOverdueIds();

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

    // 이번 집계에 포함된 unified_id 목록(소카테고리별)
    const matchBySub = new Map<SmsSubCategory, number[]>();
    ALL_SUBS.forEach((s) => matchBySub.set(s, []));

    let upserted = 0;

    for (const row of unifiedRows) {
      const data = row?.data ?? {};

      // ✅ 예외 규칙: 특정 거래처분류+안내분류 조합은 집계 대상에서 제외
      if (isSmsExcludedFromUnifiedRow(data)) continue;

      const decision = decideSmsSubCategoryFromUnifiedRow(data, baseToday, holidays);
      const sub = decision.subCategory;
      if (!sub) continue;

      // ✅ 만기지남 전용 예외: 오늘이 공휴일이면 이번 회차엔 만기지남 자체를 집계하지 않음
      if (sub === "만기지남" && isBaseDateHoliday) continue;

      // ✅ 만기지남 전용 예외: 역대 한 번이라도 발송 확정된 건은 다시 집계하지 않음(영구 1회)
      if (sub === "만기지남" && alreadyNotifiedOverdueIds.has(row.id)) continue;

      matchBySub.get(sub)!.push(row.id);

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
    }

    // ✅ excluded 처리(스냅샷 정리)
    // - 이번 집계에 포함되지 않은 대상은 제외 처리
    // - 단, success/fail 확정은 보호하고, pending/sending/sent만 대상으로 제한
    let excluded = 0;

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

    return NextResponse.json({
      ok: true,
      baseDate,
      upserted,
      excluded,
    });
  } catch (e) {
    console.error("POST /api/sms/aggregate error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}