import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type UnreturnedRow = {
  id: number;
  data: Record<string, unknown> | null;
};

type UnreturnedResponse = {
  ok?: boolean;
  기준일자?: string;
  count?: number;
  rows?: UnreturnedRow[];
  error?: string;
  message?: string;
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

async function safeReadJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return { message: text };
  }
}

async function loadRowsFromUnreturnedApi(request: Request, baseDate: string): Promise<UnreturnedRow[]> {
  const url = new URL("/api/error-check/unreturned", request.url);
  url.searchParams.set("기준일자", baseDate);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });

  const json = (await safeReadJson(response)) as UnreturnedResponse;

  if (!response.ok || !json.ok) {
    throw new Error(json.error || json.message || "미회수 다운로드용 데이터를 조회하지 못했습니다.");
  }

  return Array.isArray(json.rows) ? json.rows : [];
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const baseDate = requestUrl.searchParams.get("기준일자")?.trim() || getTodayYmd();

    const rows = await loadRowsFromUnreturnedApi(request, baseDate);
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