import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

type UnifiedRow = {
  id: number;
  data: Record<string, unknown> | null;
};

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPureBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return typeof value === "string" && value.trim() === "";
}

function parseYmdToKey(value: unknown): number | null {
  const text = toTrimmedString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

  const [yearText, monthText, dayText] = text.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return Number(`${yearText}${monthText}${dayText}`);
}

function isUnifiedBusinessRow(data: Record<string, unknown> | null): data is Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (data["__type"] === "signup_draft") return false;
  return true;
}

function isPostpartumCategory(value: unknown): boolean {
  return toTrimmedString(value).includes("조리원");
}

export async function GET(request: NextRequest) {
  try {
    const 기준일자 =
      request.nextUrl.searchParams.get("기준일자")?.trim() ||
      request.nextUrl.searchParams.get("baseDate")?.trim() ||
      "";

    if (!기준일자) {
      return NextResponse.json(
        { ok: false, error: "기준일자를 입력해주세요." },
        { status: 400 }
      );
    }

    const 기준일자Key = parseYmdToKey(기준일자);
    if (기준일자Key === null) {
      return NextResponse.json(
        { ok: false, error: "기준일자 형식이 올바르지 않습니다. (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const result = await query("SELECT id, data FROM unified ORDER BY id ASC");
    const dbRows: UnifiedRow[] = Array.isArray((result as any)?.rows)
      ? ((result as any).rows as UnifiedRow[])
      : [];

    const rows = dbRows.filter((row) => {
      if (!isUnifiedBusinessRow(row.data)) return false;

      const data = row.data;

      // 제외: 거래처분류에 '조리원' 포함
      if (isPostpartumCategory(data["거래처분류"])) return false;

      // 조건: 반납요청일 순수 공란
      if (!isPureBlank(data["반납요청일"])) return false;

      // 조건: 반납완료일 순수 공란
      if (!isPureBlank(data["반납완료일"])) return false;

      // 조건: 종료일이 기준일자 포함 이전
      const 종료일Key = parseYmdToKey(data["종료일"]);
      if (종료일Key === null) return false;

      return 종료일Key <= 기준일자Key;
    });

    return NextResponse.json({
      ok: true,
      기준일자,
      count: rows.length,
      rows,
    });
  } catch (error) {
    console.error("GET /api/error-check/unreturned error:", error);

    return NextResponse.json(
      { ok: false, error: "미회수 데이터를 조회하지 못했습니다." },
      { status: 500 }
    );
  }
}