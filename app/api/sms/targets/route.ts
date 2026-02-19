import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { SmsSubCategory } from "@/sms/types/sms.types";
import { calcUnifiedStatus } from "@/unified/status/calcUnifiedStatus";

function getKstTodayYmd() {
  // "YYYY-MM-DD"
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeSubCategory(v: string | null): SmsSubCategory | null {
  const s = String(v ?? "").trim();
  if (s === "대여첫안내" || s === "만기3일전" || s === "만기지남") return s;
  return null;
}

function normalizeBaseDate(v: string | null): string | null {
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

function pick(data: Record<string, any>, key: string) {
  const v = (data as any)?.[key];
  if (v === undefined) return null;
  return v;
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
    const baseToday = ymdToDateLocal(baseDate);

    // ✅ 문자 화면은 "통합관리 데이터 그대로"가 원칙:
    // - sms_targets는 발송대상 확정/상태용
    // - 표에 보여줄 값은 unified.data를 JOIN 해서 그대로 내려준다.
    const r = await query(
      `
      SELECT
        t.id AS target_id,
        t.unified_id,
        t.sub_category,
        t.base_date,
        t.target_status,
        u.data
      FROM sms_targets t
      JOIN unified u ON u.id = t.unified_id
      WHERE t.sub_category = $1
        AND t.base_date = $2::date
        AND t.target_status <> 'excluded'
      ORDER BY t.id ASC
      `,
      [subCategory, baseDate]
    );

    const rows = (r.rows ?? []).map((row: any) => {
      const data: Record<string, any> =
        row?.data && typeof row.data === "object" ? row.data : {};

      const derived = calcUnifiedStatus(
        {
          수취인명: pick(data, "수취인명"),
          연락처1: pick(data, "연락처1"),
          계약자주소: pick(data, "계약자주소"),
          택배발송일: pick(data, "택배발송일"),
          시작일: pick(data, "시작일"),
          종료일: pick(data, "종료일"),
          반납요청일: pick(data, "반납요청일"),
          반납완료일: pick(data, "반납완료일"),
        },
        baseToday
      );

      // ✅ SmsTargetTable에서 선택/키로 쓰는 id는 sms_targets.id 여야 함
      return {
        id: Number(row?.target_id),
        unified_id: Number(row?.unified_id),
        sub_category: String(row?.sub_category ?? ""),
        base_date: String(row?.base_date ?? baseDate),
        target_status: String(row?.target_status ?? "pending"),

        // 통합관리 컬럼(그대로)
        거래처분류: pick(data, "거래처분류"),
        상태: derived.status, // 통합관리와 동일 파생 로직
        안내분류: pick(data, "안내분류"),
        기기번호: pick(data, "기기번호"),
        제품: pick(data, "제품"),
        수취인명: pick(data, "수취인명"),
        연락처1: pick(data, "연락처1"),
        연락처2: pick(data, "연락처2"),
        계약자주소: pick(data, "계약자주소"),
        택배발송일: pick(data, "택배발송일"),
        시작일: pick(data, "시작일"),
        종료일: pick(data, "종료일"),
        반납요청일: pick(data, "반납요청일"),
        반납완료일: pick(data, "반납완료일"),
        특이사항1: pick(data, "특이사항1"),
      };
    });

    return NextResponse.json({
      ok: true,
      subCategory,
      baseDate,
      rows,
    });
  } catch (e) {
    console.error("GET /api/sms/targets error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}