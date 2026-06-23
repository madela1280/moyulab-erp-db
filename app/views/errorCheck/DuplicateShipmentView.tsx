"use client";

import * as unifiedColumnsModule from "@/unified/columns/unifiedColumns";
import { useMemo, useState } from "react";

type UnifiedRow = {
  id: number;
  data: Record<string, unknown>;
};

type DuplicateShipmentSummary = {
  totalRows: number;
  deviceDuplicateRows: number;
  recipientDuplicateRows: number;
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

function isPureBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return String(value).trim() === "";
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
  const numericMap = entries.every(([, entryValue]) => isFiniteWidth(entryValue));
  if (numericMap && entries.length > 0) {
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

function normalizeRows(payload: Record<string, unknown>): UnifiedRow[] {
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];

  return rawRows
    .filter((row): row is UnifiedRow => {
      return isRecord(row) && typeof row.id === "number" && isRecord(row.data);
    })
    .map((row) => ({
      id: row.id,
      data: row.data,
    }));
}

function normalizeSummary(
  payload: Record<string, unknown>,
  rows: UnifiedRow[]
): DuplicateShipmentSummary {
  const raw = isRecord(payload.summary) ? payload.summary : {};

  return {
    totalRows: typeof raw.totalRows === "number" ? raw.totalRows : rows.length,
    deviceDuplicateRows:
      typeof raw.deviceDuplicateRows === "number" ? raw.deviceDuplicateRows : 0,
    recipientDuplicateRows:
      typeof raw.recipientDuplicateRows === "number" ? raw.recipientDuplicateRows : 0,
  };
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

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return String(value);
}

function formatCount(value: number): string {
  return `${value.toLocaleString()}건`;
}

function parseFilenameFromDisposition(disposition: string | null): string {
  if (!disposition) return "duplicate-shipment.csv";

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return "duplicate-shipment.csv";
}

export default function DuplicateShipmentView() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [summary, setSummary] = useState<DuplicateShipmentSummary>({
    totalRows: 0,
    deviceDuplicateRows: 0,
    recipientDuplicateRows: 0,
  });
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const [error, setError] = useState("");

  const unifiedDefaults = useMemo(() => extractUnifiedColumnDefaults(), []);

  const rowKeys = useMemo(() => collectRowKeys(rows), [rows]);

  const visibleColumnKeys = useMemo(() => {
    return resolveColumnKeys(unifiedDefaults.order, columnOrder, rowKeys);
  }, [unifiedDefaults.order, columnOrder, rowKeys]);

  const resolvedColumnWidths = useMemo(() => {
    const next: Record<string, number> = {};

    for (const key of visibleColumnKeys) {
      next[key] = columnWidths[key] ?? unifiedDefaults.widths[key] ?? 140;
    }

    return next;
  }, [visibleColumnKeys, columnWidths, unifiedDefaults.widths]);

  const handleQuery = async () => {
    setLoading(true);
    setError("");

    try {
      const [duplicateRes, settingsRes] = await Promise.all([
        fetch("/api/error-check/duplicate-shipment", {
          method: "GET",
          cache: "no-store",
        }),
        fetch("/api/unified-grid-settings", {
          method: "GET",
          cache: "no-store",
        }),
      ]);

      const duplicateJson = await safeReadJson(duplicateRes);
      const settingsJson = await safeReadJson(settingsRes);

      if (!duplicateRes.ok) {
        const message =
          typeof duplicateJson.message === "string"
            ? duplicateJson.message
            : "중복출고 데이터를 조회하지 못했습니다.";
        throw new Error(message);
      }

      const nextRows = normalizeRows(duplicateJson);
      const nextSummary = normalizeSummary(duplicateJson, nextRows);

      setRows(nextRows);
      setSummary(nextSummary);
      setHasQueried(true);

      if (settingsRes.ok) {
        const nextSettings = normalizeGridSettings(settingsJson);
        setColumnOrder(nextSettings.columnOrder);
        setColumnWidths(nextSettings.columnWidths);
      } else {
        setColumnOrder([]);
        setColumnWidths({});
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "중복출고 조회 중 오류가 발생했습니다.";

      setRows([]);
      setSummary({
        totalRows: 0,
        deviceDuplicateRows: 0,
        recipientDuplicateRows: 0,
      });
      setColumnOrder([]);
      setColumnWidths({});
      setHasQueried(true);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloadLoading(true);
    setError("");

    try {
      const response = await fetch("/api/error-check/duplicate-shipment/export", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const errorJson = await safeReadJson(response);
        const message =
          typeof errorJson.message === "string"
            ? errorJson.message
            : "중복출고 다운로드 중 오류가 발생했습니다.";
        throw new Error(message);
      }

      const blob = await response.blob();
      const filename = parseFilenameFromDisposition(
        response.headers.get("Content-Disposition")
      );

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "중복출고 다운로드 중 오류가 발생했습니다.";
      setError(message);
    } finally {
      setDownloadLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "16px 20px",
        height: "100%",
        minHeight: 0,
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
            중복출고
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadLoading}
            style={{
              height: 40,
              padding: "0 18px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: downloadLoading ? "#e2e8f0" : "#ffffff",
              color: "#0f172a",
              fontSize: 14,
              fontWeight: 600,
              cursor: downloadLoading ? "default" : "pointer",
            }}
          >
            {downloadLoading ? "다운로드중..." : "다운로드"}
          </button>

          <button
            type="button"
            onClick={handleQuery}
            disabled={loading}
            style={{
              height: 40,
              padding: "0 18px",
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: loading ? "#93c5fd" : "#2563eb",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "조회중..." : "조회"}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        <SummaryCard label="총 추출 행" value={formatCount(summary.totalRows)} />
        <SummaryCard
          label="기기번호 중복 행"
          value={formatCount(summary.deviceDuplicateRows)}
        />
        <SummaryCard
          label="수취인명+연락처1 중복 행"
          value={formatCount(summary.recipientDuplicateRows)}
        />
      </div>

      {error ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          border: "1px solid #dbe2ea",
          borderRadius: 10,
          background: "#ffffff",
          overflow: "auto",
        }}
      >
        {!hasQueried ? (
          <EmptyMessage message="조회 버튼을 눌러 중복출고 데이터를 불러오세요." />
        ) : rows.length === 0 ? (
          <EmptyMessage message="조건에 맞는 중복출고 데이터가 없습니다." />
        ) : (
          <table
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              width: "max-content",
              minWidth: "100%",
              tableLayout: "fixed",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    position: "sticky",
                    top: 0,
                    left: 0,
                    zIndex: 3,
                    background: "#f8fafc",
                    borderBottom: "1px solid #dbe2ea",
                    borderRight: "1px solid #e5e7eb",
                    minWidth: 56,
                    width: 56,
                    height: 29,
                    padding: "0 8px",
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#334155",
                  }}
                >
                  No
                </th>

                {visibleColumnKeys.map((key) => (
                  <th
                    key={key}
                    title={key}
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 2,
                      background: "#f8fafc",
                      borderBottom: "1px solid #dbe2ea",
                      borderRight: "1px solid #e5e7eb",
                      minWidth: resolvedColumnWidths[key],
                      width: resolvedColumnWidths[key],
                      maxWidth: resolvedColumnWidths[key],
                      height: 29,
                      padding: "0 8px",
                      textAlign: "left",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#334155",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {key}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.id}>
                  <td
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 1,
                      background: "#ffffff",
                      borderBottom: "1px solid #eef2f7",
                      borderRight: "1px solid #e5e7eb",
                      width: 56,
                      minWidth: 56,
                      maxWidth: 56,
                      height: 27,
                      padding: "0 8px",
                      textAlign: "center",
                      fontSize: 12,
                      color: "#475569",
                    }}
                  >
                    {rowIndex + 1}
                  </td>

                  {visibleColumnKeys.map((key) => {
                    const rawValue = row.data[key];
                    const value = isPureBlank(rawValue) ? "" : formatCellValue(rawValue);

                    return (
                      <td
                        key={`${row.id}-${key}`}
                        title={value}
                        style={{
                          borderBottom: "1px solid #eef2f7",
                          borderRight: "1px solid #eef2f7",
                          minWidth: resolvedColumnWidths[key],
                          width: resolvedColumnWidths[key],
                          maxWidth: resolvedColumnWidths[key],
                          height: 27,
                          padding: "0 8px",
                          fontSize: 12,
                          color: "#0f172a",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          background: "#ffffff",
                        }}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #dbe2ea",
        borderRadius: 10,
        background: "#ffffff",
        padding: "12px 14px",
      }}
    >
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
        {value}
      </div>
    </div>
  );
}

function EmptyMessage({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 240,
        padding: 20,
        color: "#64748b",
        fontSize: 14,
      }}
    >
      {message}
    </div>
  );
}