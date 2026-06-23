import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

type UnifiedDbRow = {
  id: number;
  data: unknown;
};

type UnreturnedRow = {
  id: number;
  data: Record<string, unknown> | null;
};

const PRIORITY_COLUMNS = [
  "거래처분류",
  "상태",
  "안내분류",
  "구매/렌탈",
  "기기번호",
  "기종",
  "에러횟수",
  "제품",
  "수취인명",
  "연락처1",
  "연락처2",
  "계약자주소",
  "택배발송일",
  "시작일",
  "종료일",
  "반납요청일",
  "반납완료일",
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toUnreturnedRow(row: UnifiedDbRow): UnreturnedRow | null {
  if (typeof row.id !== "number") return null;
  if (!isPlainObject(row.data)) return null;

  return {
    id: row.id,
    data: row.data,
  };
}

function isPureBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return String(value).trim() === "";
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function isJoriwonCategory(value: unknown): boolean {
  return normalizeText(value).includes("조리원");
}

function parseYmd(value: unknown): Date | null {
  if (isPureBlank(value)) return null;

  const text = String(value).trim();
  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

function isEndDateOnOrBeforeBaseDate(endDateValue: unknown, baseDateText: string): boolean {
  const endDate = parseYmd(endDateValue);
  const baseDate = parseYmd(baseDateText);

  if (!endDate || !baseDate) return false;
  return endDate.getTime() <= baseDate.getTime();
}

function getTodayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildColumns(rows: UnreturnedRow[]): string[] {
  const keySet = new Set<string>();

  for (const row of rows) {
    if (!row.data || typeof row.data !== "object" || Array.isArray(row.data)) continue;

    for (const key of Object.keys(row.data)) {
      if (key.startsWith("__")) continue;
      keySet.add(key);
    }
  }

  const rest = Array.from(keySet).filter((key) => !PRIORITY_COLUMNS.includes(key as never));
  rest.sort((a, b) => a.localeCompare(b, "ko"));

  return [...PRIORITY_COLUMNS.filter((key) => keySet.has(key)), ...rest];
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function escapeCsvValue(value: unknown): string {
  const text = stringifyCell(value);
  if (text === "") return "";

  const escaped = text.replace(/"/g, '""');
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
}

function buildCsv(rows: UnreturnedRow[], columns: string[]): string {
  const headerLine = ["No", ...columns].map(escapeCsvValue).join(",");

  const bodyLines = rows.map((row, index) => {
    const values = [index + 1, ...columns.map((column) => row.data?.[column] ?? "")];
    return values.map(escapeCsvValue).join(",");
  });

  return [headerLine, ...bodyLines].join("\r\n");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function buildFilename(baseDate: string): string {
  const now = new Date();
  const hh = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  const safeBaseDate = baseDate.replace(/[^0-9-]/g, "") || getTodayYmd();

  return `unreturned-${safeBaseDate}-${hh}${mi}${ss}.csv`;
}

async function loadUnreturnedRows(baseDate: string): Promise<UnreturnedRow[]> {
  const result = await query(
    `
      SELECT id, data
      FROM unified
      WHERE jsonb_typeof(data) = 'object'
        AND COALESCE(data->>'__type', '') <> 'signup_draft'
        AND COALESCE(BTRIM(data->>'반납요청일'), '') = ''
        AND COALESCE(BTRIM(data->>'반납완료일'), '') = ''
      ORDER BY id ASC
    `
  );

  const rows = (result.rows as UnifiedDbRow[])
    .map(toUnreturnedRow)
    .filter((row): row is UnreturnedRow => row !== null)
    .filter((row) => {
      return (
        isPureBlank(row.data?.["반납요청일"]) &&
        isPureBlank(row.data?.["반납완료일"]) &&
        !isJoriwonCategory(row.data?.["거래처분류"]) &&
        isEndDateOnOrBeforeBaseDate(row.data?.["종료일"], baseDate)
      );
    });

  return rows;
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const baseDate = requestUrl.searchParams.get("기준일자")?.trim() || getTodayYmd();

    if (!parseYmd(baseDate)) {
      return NextResponse.json(
        {
          ok: false,
          message: "올바른 기준일자를 입력해주세요.",
        },
        { status: 400 }
      );
    }

    const rows = await loadUnreturnedRows(baseDate);
    const columns = buildColumns(rows);
    const csv = "\uFEFF" + buildCsv(rows, columns);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildFilename(baseDate)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[error-check/unreturned/export][GET] failed:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "미회수 다운로드 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}