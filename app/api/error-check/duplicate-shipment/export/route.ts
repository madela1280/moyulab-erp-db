import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

type UnifiedDbRow = {
  id: number;
  data: unknown;
};

type UnifiedRow = {
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

function toUnifiedRow(row: UnifiedDbRow): UnifiedRow | null {
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

function normalizePhone(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\D+/g, "");
}

function normalizeDeviceNo(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, "").toUpperCase();
}

function isJoriwonCategory(value: unknown): boolean {
  return normalizeText(value).includes("조리원");
}

function collectDuplicateIds(
  rows: UnifiedRow[],
  getKey: (row: UnifiedRow) => string
): Set<number> {
  const grouped = new Map<string, UnifiedRow[]>();

  for (const row of rows) {
    const key = getKey(row);
    if (!key) continue;

    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const duplicateIds = new Set<number>();

  for (const list of grouped.values()) {
    if (list.length < 2) continue;
    for (const row of list) {
      duplicateIds.add(row.id);
    }
  }

  return duplicateIds;
}

function buildColumns(rows: UnifiedRow[]): string[] {
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

function buildCsv(rows: UnifiedRow[], columns: string[]): string {
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

function buildFilename(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  return `duplicate-shipment-${yyyy}${mm}${dd}-${hh}${mi}${ss}.csv`;
}

async function loadDuplicateShipmentRows(): Promise<UnifiedRow[]> {
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

  const baseRows: UnifiedRow[] = (result.rows as UnifiedDbRow[])
    .map(toUnifiedRow)
    .filter((row): row is UnifiedRow => row !== null)
    .filter((row) => {
      return (
        isPureBlank(row.data?.["반납요청일"]) &&
        isPureBlank(row.data?.["반납완료일"])
      );
    });

  const deviceDuplicateIds = collectDuplicateIds(baseRows, (row) => {
    const deviceNo = normalizeDeviceNo(row.data?.["기기번호"]);
    return deviceNo || "";
  });

  const recipientTargetRows = baseRows.filter(
    (row) => !isJoriwonCategory(row.data?.["거래처분류"])
  );

  const recipientDuplicateIds = collectDuplicateIds(recipientTargetRows, (row) => {
    const recipientName = normalizeText(row.data?.["수취인명"]);
    const phone = normalizePhone(row.data?.["연락처1"]);

    if (!recipientName || !phone) return "";
    return `${recipientName}||${phone}`;
  });

  const allDuplicateIds = new Set<number>([
    ...deviceDuplicateIds,
    ...recipientDuplicateIds,
  ]);

  return baseRows.filter((row) => allDuplicateIds.has(row.id));
}

export async function GET() {
  try {
    const rows = await loadDuplicateShipmentRows();
    const columns = buildColumns(rows);
    const csv = "\uFEFF" + buildCsv(rows, columns);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildFilename()}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[error-check/duplicate-shipment/export][GET] failed:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "중복출고 다운로드 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}