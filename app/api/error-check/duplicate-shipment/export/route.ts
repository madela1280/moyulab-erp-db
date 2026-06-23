import { NextResponse } from "next/server";
import { query } from "../../../../lib/db";
import * as unifiedColumnsModule from "../../../../unified/columns/unifiedColumns";

export const dynamic = "force-dynamic";

type UnifiedDbRow = {
  id: number;
  data: unknown;
};

type UnifiedRow = {
  id: number;
  data: Record<string, unknown>;
};

type UnifiedColumnDefaults = {
  order: string[];
  widths: Record<string, number>;
};

const ORDER_EXPORT_NAMES = [
  "DEFAULT_COLUMN_ORDER",
  "defaultColumnOrder",
  "UNIFIED_COLUMN_ORDER",
  "unifiedColumnOrder",
  "COLUMN_ORDER",
  "columnOrder",
  "UNIFIED_COLUMNS",
  "unifiedColumns",
  "columns",
  "COLUMNS",
  "DEFAULT_COLUMNS",
  "defaultColumns",
] as const;

const WIDTH_EXPORT_NAMES = [
  "DEFAULT_COLUMN_WIDTHS",
  "defaultColumnWidths",
  "UNIFIED_COLUMN_WIDTHS",
  "unifiedColumnWidths",
  "COLUMN_WIDTHS",
  "columnWidths",
  "widths",
  "DEFAULT_WIDTHS",
  "defaultWidths",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
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

function isFiniteWidth(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 40;
}

function getColumnKeyFromObject(obj: Record<string, unknown>): string | null {
  const candidates = [
    obj.key,
    obj.columnKey,
    obj.field,
    obj.id,
    obj.name,
    obj.label,
    obj.accessorKey,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return null;
}

function getColumnWidthFromObject(obj: Record<string, unknown>): number | null {
  const candidates = [
    obj.width,
    obj.defaultWidth,
    obj.initialWidth,
    obj.size,
    obj.minWidth,
  ];

  for (const value of candidates) {
    if (isFiniteWidth(value)) return value;
  }

  return null;
}

function pushUnique(arr: string[], key: string) {
  if (!key || key.startsWith("__")) return;
  if (!arr.includes(key)) arr.push(key);
}

function extractOrderFromValue(
  value: unknown,
  output: string[],
  visited = new WeakSet<object>()
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim() !== "") {
        pushUnique(output, item.trim());
        continue;
      }

      if (isRecord(item)) {
        const key = getColumnKeyFromObject(item);
        if (key) pushUnique(output, key);
        extractOrderFromValue(item, output, visited);
      }
    }
    return;
  }

  if (!isRecord(value)) return;
  if (visited.has(value)) return;
  visited.add(value);

  const key = getColumnKeyFromObject(value);
  if (key) pushUnique(output, key);

  for (const nested of Object.values(value)) {
    extractOrderFromValue(nested, output, visited);
  }
}

function extractWidthsFromValue(
  value: unknown,
  output: Record<string, number>,
  visited = new WeakSet<object>()
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      extractWidthsFromValue(item, output, visited);
    }
    return;
  }

  if (!isRecord(value)) return;
  if (visited.has(value)) return;
  visited.add(value);

  const key = getColumnKeyFromObject(value);
  const width = getColumnWidthFromObject(value);
  if (key && width) {
    output[key] = width;
  }

  const entries = Object.entries(value);
  const numericMap = entries.length > 0 && entries.every(([, entryValue]) => isFiniteWidth(entryValue));
  if (numericMap) {
    for (const [entryKey, entryValue] of entries) {
      if (!entryKey.startsWith("__") && isFiniteWidth(entryValue)) {
        output[entryKey] = entryValue;
      }
    }
  }

  for (const nested of Object.values(value)) {
    extractWidthsFromValue(nested, output, visited);
  }
}

function getNamedModuleValue(
  moduleRecord: Record<string, unknown>,
  names: readonly string[]
): unknown[] {
  const values: unknown[] = [];
  for (const name of names) {
    if (name in moduleRecord) {
      values.push(moduleRecord[name]);
    }
  }
  return values;
}

function extractUnifiedColumnDefaults(): UnifiedColumnDefaults {
  const moduleRecord = unifiedColumnsModule as Record<string, unknown>;
  const order: string[] = [];
  const widths: Record<string, number> = {};

  const namedOrderValues = getNamedModuleValue(moduleRecord, ORDER_EXPORT_NAMES);
  const namedWidthValues = getNamedModuleValue(moduleRecord, WIDTH_EXPORT_NAMES);

  for (const value of namedOrderValues) {
    extractOrderFromValue(value, order);
  }

  for (const value of namedWidthValues) {
    extractWidthsFromValue(value, widths);
  }

  if (order.length === 0) {
    for (const value of Object.values(moduleRecord)) {
      extractOrderFromValue(value, order);
    }
  }

  if (Object.keys(widths).length === 0) {
    for (const value of Object.values(moduleRecord)) {
      extractWidthsFromValue(value, widths);
    }
  }

  return { order, widths };
}

async function safeReadJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return { message: text };
  }
}

function normalizeGridSettings(payload: Record<string, unknown>) {
  const source = isRecord(payload.data) ? payload.data : payload;

  const columnOrder = Array.isArray(source.columnOrder)
    ? source.columnOrder.filter(
        (value): value is string => typeof value === "string" && value.trim() !== ""
      )
    : [];

  const widthSource = isRecord(source.columnWidths)
    ? source.columnWidths
    : isRecord(source.widths)
    ? source.widths
    : {};

  const columnWidths: Record<string, number> = {};

  for (const [key, value] of Object.entries(widthSource)) {
    if (isFiniteWidth(value)) {
      columnWidths[key] = value;
    }
  }

  return { columnOrder, columnWidths };
}

async function loadSavedColumnOrder(request: Request): Promise<string[]> {
  try {
    const settingsUrl = new URL("/api/unified-grid-settings", request.url);
    const response = await fetch(settingsUrl.toString(), {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });

    if (!response.ok) return [];

    const json = await safeReadJson(response);
    const settings = normalizeGridSettings(json);
    return settings.columnOrder;
  } catch {
    return [];
  }
}

function collectRowKeys(rows: UnifiedRow[]): string[] {
  const keys: string[] = [];

  for (const row of rows) {
    for (const key of Object.keys(row.data)) {
      if (!key || key.startsWith("__")) continue;
      pushUnique(keys, key);
    }
  }

  return keys;
}

function resolveColumnKeys(
  defaultOrder: string[],
  savedOrder: string[],
  rowKeys: string[]
): string[] {
  const resolved: string[] = [];
  const baseOrder = savedOrder.length > 0 ? savedOrder : defaultOrder;

  for (const key of baseOrder) pushUnique(resolved, key);
  for (const key of defaultOrder) pushUnique(resolved, key);
  for (const key of rowKeys) pushUnique(resolved, key);

  return resolved.length > 0 ? resolved : rowKeys;
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

function buildCsv(rows: UnifiedRow[], columns: string[]): string {
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

export async function GET(request: Request) {
  try {
    const [rows, savedColumnOrder] = await Promise.all([
      loadDuplicateShipmentRows(),
      loadSavedColumnOrder(request),
    ]);

    const unifiedDefaults = extractUnifiedColumnDefaults();
    const rowKeys = collectRowKeys(rows);
    const columns = resolveColumnKeys(
      unifiedDefaults.order,
      savedColumnOrder,
      rowKeys
    );

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