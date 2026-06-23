"use client";

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

type DuplicateShipmentResponse = {
  ok?: boolean;
  success?: boolean;
  rows?: UnifiedRow[];
  summary?: Partial<DuplicateShipmentSummary>;
  message?: string;
};

type UnifiedGridSettingsResponse = {
  columnOrder?: unknown;
  columnWidths?: unknown;
  widths?: unknown;
  data?: {
    columnOrder?: unknown;
    columnWidths?: unknown;
    widths?: unknown;
  };
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
      return (
        isRecord(row) &&
        typeof row.id === "number" &&
        isRecord(row.data)
      );
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

function buildColumnKeys(rows: UnifiedRow[], orderedKeys: string[]): string[] {
  const rowKeys = collectRowKeys(rows);
  const ordered = orderedKeys.filter((key) => rowKeys.includes(key));
  const remaining = rowKeys.filter((key) => !ordered.includes(key));
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
  const [hasQueried, setHasQueried] = useState(false);
  const [error, setError] = useState("");

  const visibleColumnKeys = useMemo(
    () => buildColumnKeys(rows, columnOrder),
    [rows, columnOrder]
  );

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
      const nextSettings = normalizeGridSettings(settingsJson);

      setRows(nextRows);
      setSummary(nextSummary);
      setColumnOrder(nextSettings.columnOrder);
      setColumnWidths(nextSettings.columnWidths);
      setHasQueried(true);
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
          <div style={{ marginTop: 4, fontSize: 13, color: "#475569" }}>
            반납요청일/반납완료일이 모두 순수 공란인 통합관리 데이터에서
            기기번호 중복, 수취인명+연락처1 중복 행을 조회합니다.
          </div>
        </div>

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
                    height: 36,
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
                      minWidth: columnWidths[key] ?? 140,
                      width: columnWidths[key] ?? 140,
                      maxWidth: columnWidths[key] ?? 140,
                      height: 36,
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
                      height: 34,
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
                          minWidth: columnWidths[key] ?? 140,
                          width: columnWidths[key] ?? 140,
                          maxWidth: columnWidths[key] ?? 140,
                          height: 34,
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