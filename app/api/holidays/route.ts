import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// ✅ 공휴일 판정 데이터. 통합관리 "만기3일전(공휴일)" 표시 등 여러 기능이 공유해서 쓸 수 있도록
// 별도 테이블로 둔다(unified/locks 스키마와 무관, 신규 테이블만 추가).
const SEED_HOLIDAYS: Array<{ date: string; name: string }> = [
  { date: "2026-01-01", name: "신정" },
  { date: "2026-02-16", name: "설날연휴" },
  { date: "2026-02-17", name: "설날" },
  { date: "2026-02-18", name: "설날연휴" },
  { date: "2026-03-02", name: "삼일절 대체공휴일" },
  { date: "2026-05-05", name: "어린이날" },
  { date: "2026-05-25", name: "부처님오신날 대체공휴일" },
  { date: "2026-08-17", name: "광복절 대체공휴일" },
  { date: "2026-09-24", name: "추석연휴" },
  { date: "2026-09-25", name: "추석" },
  { date: "2026-09-28", name: "추석연휴 대체공휴일" },
  { date: "2026-10-05", name: "개천절 대체공휴일" },
  { date: "2026-10-09", name: "한글날" },
  { date: "2026-12-25", name: "성탄절" },
  { date: "2027-01-01", name: "신정" },
  { date: "2027-02-08", name: "설날연휴" },
  { date: "2027-02-09", name: "설날" },
  { date: "2027-02-10", name: "설날연휴" },
  { date: "2027-03-01", name: "삼일절" },
  { date: "2027-05-05", name: "어린이날" },
  { date: "2027-05-13", name: "부처님오신날" },
  { date: "2027-08-16", name: "광복절 대체공휴일" },
  { date: "2027-09-14", name: "추석연휴" },
  { date: "2027-09-15", name: "추석" },
  { date: "2027-09-16", name: "추석연휴" },
  { date: "2027-10-04", name: "개천절 대체공휴일" },
  { date: "2027-10-11", name: "한글날 대체공휴일" },
  { date: "2027-12-27", name: "성탄절 대체공휴일" },
];

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS holidays (
      date DATE PRIMARY KEY,
      name TEXT
    )
  `);
}

async function ensureSeeded() {
  const { rows } = await query(`SELECT COUNT(*)::int AS cnt FROM holidays`);
  const count = Number(rows?.[0]?.cnt || 0);
  if (count > 0) return;

  for (const h of SEED_HOLIDAYS) {
    await query(
      `INSERT INTO holidays (date, name) VALUES ($1::date, $2) ON CONFLICT (date) DO NOTHING`,
      [h.date, h.name]
    );
  }
}

export async function GET() {
  try {
    await ensureTable();
    await ensureSeeded();

    const result = await query(`SELECT to_char(date, 'YYYY-MM-DD') AS date, name FROM holidays ORDER BY date ASC`);

    return NextResponse.json({
      ok: true,
      dates: (result.rows || []).map((r: any) => String(r.date)),
      holidays: (result.rows || []).map((r: any) => ({ date: String(r.date), name: r.name })),
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "공휴일 정보를 불러오지 못했습니다.",
        dates: [],
        holidays: [],
      },
      { status: 500 }
    );
  }
}
