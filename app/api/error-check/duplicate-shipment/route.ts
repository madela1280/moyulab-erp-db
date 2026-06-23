import { NextResponse } from "next/server";
import { query } from "../../../lib/db";

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

export async function GET() {
  try {
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

    const recipientDuplicateIds = collectDuplicateIds(
      recipientTargetRows,
      (row) => {
        const recipientName = normalizeText(row.data["수취인명"]);
        const phone = normalizePhone(row.data["연락처1"]);

        if (!recipientName || !phone) return "";
        return `${recipientName}||${phone}`;
      }
    );

    const allDuplicateIds = new Set<number>([
      ...deviceDuplicateIds,
      ...recipientDuplicateIds,
    ]);

    const rows = baseRows
      .filter((row) => allDuplicateIds.has(row.id))
      .map((row) => {
        const reasons: string[] = [];

        if (deviceDuplicateIds.has(row.id)) {
          reasons.push("device_no");
        }

        if (recipientDuplicateIds.has(row.id)) {
          reasons.push("recipient_phone");
        }

        return {
          id: row.id,
          data: {
            ...row.data,
            __duplicateReasons: reasons,
          },
        };
      });

    return NextResponse.json({
      ok: true,
      rows,
      summary: {
        totalRows: rows.length,
        deviceDuplicateRows: deviceDuplicateIds.size,
        recipientDuplicateRows: recipientDuplicateIds.size,
      },
    });
  } catch (error) {
    console.error("[error-check/duplicate-shipment][GET] failed:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "중복출고 조회 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}