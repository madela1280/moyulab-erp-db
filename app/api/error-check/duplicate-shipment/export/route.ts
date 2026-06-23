import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

type UnifiedDbRow = {
  id: number;
  data: unknown;
};

type UnifiedRow = {
  id: number;
  data: Record<string, unknown>;
};

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

function collectVisibleColumns(rows: UnifiedRow[]): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];

  for (const row of rows) {
    for (const key of Object.keys(row.data)) {
      if (!key || key.startsWith("__")) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      columns.push(key);
    }
  }

  return columns;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatCellValue).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function escapeCsvValue(value: unknown): string {
  const text = formatCellValue(value);
  if (text === "") return "";

  const escaped = text.replace(/"/g, '""');
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function buildCsv(rows: UnifiedRow[]): string {
  const columns = collectVisibleColumns(rows);

  if (columns.length === 0) {
    return "";
  }

  const headerLine = columns.map(escapeCsvValue).join(",");

  const bodyLines = rows.map((row) =>
    columns.map((column) => escapeCsvValue(row.data[column])).join(",")
  );

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
        isPureBlank(row.data["반납요청일"]) &&
        isPureBlank(row.data["반납완료일"])
      );
    });

  const deviceDuplicateIds = collectDuplicateIds(baseRows, (row) => {
    const deviceNo = normalizeDeviceNo(row.data["기기번호"]);
    return deviceNo || "";
  });

  const recipientTargetRows = baseRows.filter(
    (row) => !isJoriwonCategory(row.data["거래처분류"])
  );

  const recipientDuplicateIds = collectDuplicateIds(recipientTargetRows, (row) => {
    const recipientName = normalizeText(row.data["수취인명"]);
    const phone = normalizePhone(row.data["연락처1"]);

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
    const csv = "\uFEFF" + buildCsv(rows);

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