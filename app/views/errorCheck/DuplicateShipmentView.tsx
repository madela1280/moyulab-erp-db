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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isPureBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return String(value).trim() === "";
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

  const totalRows =
    typeof raw.totalRows === "number" ? raw.totalRows : rows.length;

  const deviceDuplicateRows =
    typeof raw.deviceDuplicateRows === "number" ? raw.deviceDuplicateRows : 0;

  const recipientDuplicateRows =
    typeof raw.recipientDuplicateRows === "number"
      ? raw.recipientDuplicateRows
      : 0;

  return {
    totalRows,
    deviceDuplicateRows,
    recipientDuplicateRows,
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
    if (typeof value === "number" && Number.isFinite(value) && value > 40) {
      columnWidths[key] = value;
    }
  }

  return { columnOrder, columnWidths };
}

function getFiniteWidth(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 40
    ? value
    : null;
}

function extractColumnMetaFromObject(
  obj: Record<string, unknown>
): { key: string; width?: number } | null {
  const keyCandidates = [
    obj.key,
    obj.columnKey,
    obj.field,
    obj.id,
    obj.name,
    obj.label,
  ];

  const key = keyCandidates.find(
    (value): value is string => typeof value === "string" && value.trim() !== ""
  );

  if (!key) return null;

  const widthCandidates = [
    obj.width,
    obj.defaultWidth,
    obj.initialWidth,
    obj.minWidth,
  ];

  const width =
    widthCandidates.map(getFiniteWidth).find((value) => value !== null) ?? undefined;

  return {
    key: key.trim(),
    width,
  };
}

function extractUnifiedColumnDefaults(): UnifiedColumnDefaults {
  const order: string[] = [];
  const widths: Record<string, number> = {};
  const seen = new Set<string>();

  const pushColumn = (key: string, width?: number) => {
    const normalizedKey = key.trim();
    if (!normalizedKey || normalizedKey.startsWith("__")) return;

    if (!seen.has(normalizedKey)) {
      seen.add(normalizedKey);
      order.push(normalizedKey);
    }

    if (typeof width === "number" && Number.isFinite(width) && width > 40) {
      widths[normalizedKey] = width;
    }
  };

  const readValue = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim() !== "") {
          pushColumn(item);
          continue;
        }

        if (isRecord(item)) {
          const meta = extractColumnMetaFromObject(item);
          if (meta) {
            pushColumn(meta.key, meta.width);
          }
        }
      }
      return;
    }

    if (!isRecord(value)) return;

    const entries = Object.entries(value);
    const numericWidthEntries = entries.filter(([, entryValue]) => {
      return typeof entryValue === "number" && Number.isFinite(entryValue) && entryValue > 40;
    });

    if (numericWidthEntries.length > 0) {
      for (const [key, width] of numericWidthEntries) {
        pushColumn(key, width as number);
      }
    }

    for (const nestedValue of Object.values(value)) {
      if (Array.isArray(nestedValue)) {
        readValue(nestedValue);
      }
    }
  };

  for (const exportedValue of Object.values(
    unifiedColumnsModule as Record<string, unknown>
  )) {
    readValue(exportedValue);
  }

  return { order, widths };
}

function collectRowKeys(rows: UnifiedRow[]): string[] {
  const set = new Set<string>();

  for (const row of rows) {
    for (const key of Object.keys(row.data || {})) {
      if (key.startsWith("__")) continue;
      set.add(key);
    }
  }

  return Array.from(set);
}

function buildColumnKeys(
  rows: UnifiedRow[],
  orderedKeys: string[],
  defaultOrder: string[]
): string[] {
  const rowKeys = collectRowKeys(rows);
  const candidateOrder = [...orderedKeys, ...defaultOrder];
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const key of candidateOrder) {
    if (!rowKeys.includes(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(key);
  }

  const remaining = rowKeys.filter((key) => !seen.has(key));
  return [...ordered, ...remaining];
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

  const visibleColumnKeys = useMemo(
    () => buildColumnKeys(rows, columnOrder, unifiedDefaults.order),
    [rows, columnOrder, unifiedDefaults.order]
  );

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
      const duplicateRes = await fetch("/api/error-check/duplicate-shipment", {
        method: "GET",
        cache: "no-store",
      });

      const duplicateJson = await safeReadJson(duplicateRes);

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

      try {
        const settingsRes = await fetch("/api/unified-grid-settings", {
          method: "GET",
          cache: "no-store",
        });

        const settingsJson = await safeReadJson(settingsRes);

        if (settingsRes.ok) {
          const nextSettings = normalizeGridSettings(settingsJson);
          setColumnOrder(nextSettings.columnOrder);
          setColumnWidths(nextSettings.columnWidths);
        } else {
          setColumnOrder([]);
          setColumnWidths({});
        }
      } catch {
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
                    title={key}
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