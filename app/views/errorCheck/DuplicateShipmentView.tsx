"use client";

import { useMemo, useState } from "react";

type DuplicateShipmentRow = {
  id: number;
  data: Record<string, unknown> | null;
};

type DuplicateShipmentResponse = {
  ok?: boolean;
  rows?: DuplicateShipmentRow[];
  summary?: {
    totalRows?: number;
    deviceDuplicateRows?: number;
    recipientDuplicateRows?: number;
  };
  message?: string;
  error?: string;
};

type RowMeta = {
  row: DuplicateShipmentRow;
  deviceKey: string;
  deviceLabel: string;
  recipientKey: string;
  recipientLabel: string;
};

type DuplicateGroupItem = {
  row: DuplicateShipmentRow;
  displayNo: number;
};

type DuplicateGroup = {
  id: string;
  title: string;
  count: number;
  items: DuplicateGroupItem[];
  headerBg: string;
  rowBg: string;
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

const GROUP_COLORS = [
  {
    headerBg: "#fef3c7",
    rowBg: "#fffbeb",
  },
  {
    headerBg: "#fee2e2",
    rowBg: "#fef2f2",
  },
] as const;

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

function buildColumns(rows: DuplicateShipmentRow[]): string[] {
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

function parseFilenameFromDisposition(disposition: string | null): string {
  if (!disposition) return "duplicate-shipment.csv";

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) {
    return plainMatch[1];
  }

  return "duplicate-shipment.csv";
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

function createRowMeta(row: DuplicateShipmentRow): RowMeta {
  const deviceRaw = row.data?.["기기번호"];
  const deviceLabel = normalizeText(deviceRaw);
  const deviceKey = normalizeDeviceNo(deviceRaw);

  const recipientName = normalizeText(row.data?.["수취인명"]);
  const phoneRaw = normalizeText(row.data?.["연락처1"]);
  const phoneKey = normalizePhone(row.data?.["연락처1"]);
  const recipientAllowed = !isJoriwonCategory(row.data?.["거래처분류"]);

  const recipientKey =
    recipientAllowed && recipientName && phoneKey ? `${recipientName}||${phoneKey}` : "";

  const recipientLabel =
    recipientAllowed && recipientName && phoneRaw ? `${recipientName} / ${phoneRaw}` : "";

  return {
    row,
    deviceKey,
    deviceLabel,
    recipientKey,
    recipientLabel,
  };
}

function find(parent: number[], x: number): number {
  if (parent[x] !== x) {
    parent[x] = find(parent, parent[x]);
  }
  return parent[x];
}

function union(parent: number[], a: number, b: number) {
  const rootA = find(parent, a);
  const rootB = find(parent, b);

  if (rootA !== rootB) {
    parent[rootB] = rootA;
  }
}

function buildGroupTitle(metas: RowMeta[]): string {
  const deviceCountMap = new Map<string, { count: number; label: string }>();
  const recipientCountMap = new Map<string, { count: number; label: string }>();

  for (const meta of metas) {
    if (meta.deviceKey) {
      const current = deviceCountMap.get(meta.deviceKey);
      if (current) {
        current.count += 1;
      } else {
        deviceCountMap.set(meta.deviceKey, {
          count: 1,
          label: meta.deviceLabel || meta.deviceKey,
        });
      }
    }

    if (meta.recipientKey) {
      const current = recipientCountMap.get(meta.recipientKey);
      if (current) {
        current.count += 1;
      } else {
        recipientCountMap.set(meta.recipientKey, {
          count: 1,
          label: meta.recipientLabel || meta.recipientKey,
        });
      }
    }
  }

  const duplicateDevices = Array.from(deviceCountMap.values())
    .filter((item) => item.count >= 2)
    .map((item) => item.label)
    .sort((a, b) => a.localeCompare(b, "ko"));

  const duplicateRecipients = Array.from(recipientCountMap.values())
    .filter((item) => item.count >= 2)
    .map((item) => item.label)
    .sort((a, b) => a.localeCompare(b, "ko"));

  const titleParts: string[] = [];

  if (duplicateDevices.length > 0) {
    titleParts.push(`기기번호: ${duplicateDevices.join(", ")}`);
  }

  if (duplicateRecipients.length > 0) {
    titleParts.push(`수취인명/연락처1: ${duplicateRecipients.join(", ")}`);
  }

  return titleParts.length > 0 ? titleParts.join("  |  ") : "중복 그룹";
}

function buildDuplicateGroups(rows: DuplicateShipmentRow[]): DuplicateGroup[] {
  if (rows.length === 0) return [];

  const metas = rows.map(createRowMeta);
  const parent = metas.map((_, index) => index);

  const deviceMap = new Map<string, number>();
  const recipientMap = new Map<string, number>();

  metas.forEach((meta, index) => {
    if (meta.deviceKey) {
      const firstIndex = deviceMap.get(meta.deviceKey);
      if (typeof firstIndex === "number") {
        union(parent, firstIndex, index);
      } else {
        deviceMap.set(meta.deviceKey, index);
      }
    }

    if (meta.recipientKey) {
      const firstIndex = recipientMap.get(meta.recipientKey);
      if (typeof firstIndex === "number") {
        union(parent, firstIndex, index);
      } else {
        recipientMap.set(meta.recipientKey, index);
      }
    }
  });

  const groupedIndexMap = new Map<number, number[]>();

  metas.forEach((_, index) => {
    const root = find(parent, index);
    const current = groupedIndexMap.get(root) ?? [];
    current.push(index);
    groupedIndexMap.set(root, current);
  });

  const sortedGroups = Array.from(groupedIndexMap.values())
    .map((indexes) => indexes.sort((a, b) => metas[a].row.id - metas[b].row.id))
    .sort((a, b) => {
      const firstA = metas[a[0]]?.row.id ?? 0;
      const firstB = metas[b[0]]?.row.id ?? 0;
      return firstA - firstB;
    });

  let displayNo = 0;

  return sortedGroups.map((indexes, groupIndex) => {
    const color = GROUP_COLORS[groupIndex % GROUP_COLORS.length];
    const groupMetas = indexes.map((index) => metas[index]);
    const title = buildGroupTitle(groupMetas);

    return {
      id: `group-${groupIndex + 1}`,
      title,
      count: groupMetas.length,
      headerBg: color.headerBg,
      rowBg: color.rowBg,
      items: groupMetas.map((meta) => {
        displayNo += 1;
        return {
          row: meta.row,
          displayNo,
        };
      }),
    };
  });
}

export default function DuplicateShipmentView() {
  const [rows, setRows] = useState<DuplicateShipmentRow[]>([]);
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [downloadLoading, setDownloadLoading] = useState<boolean>(false);
  const [hasQueried, setHasQueried] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const columns = useMemo(() => buildColumns(rows), [rows]);
  const groups = useMemo(() => buildDuplicateGroups(rows), [rows]);

  const loadRows = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/error-check/duplicate-shipment", {
        method: "GET",
        cache: "no-store",
      });

      const data = (await res.json()) as DuplicateShipmentResponse;

      if (!res.ok || !data.ok) {
        throw new Error(
          data.message || data.error || "중복출고 데이터를 조회하지 못했습니다."
        );
      }

      const nextRows = Array.isArray(data.rows) ? data.rows : [];
      const nextCount =
        typeof data.summary?.totalRows === "number" ? data.summary.totalRows : nextRows.length;

      setRows(nextRows);
      setCount(nextCount);
      setHasQueried(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "중복출고 데이터를 조회하지 못했습니다.";
      setError(message);
      setRows([]);
      setCount(0);
      setHasQueried(true);
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
    <div className="w-full h-full min-h-0 flex flex-col overflow-hidden bg-white border rounded">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white">
        <div className="text-sm font-semibold text-slate-800">중복출고</div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloadLoading}
            className="h-8 px-3 text-sm rounded border bg-white text-slate-800 border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            {downloadLoading ? "다운로드중..." : "다운로드"}
          </button>

          <button
            type="button"
            onClick={() => void loadRows()}
            disabled={loading}
            className="h-8 px-3 text-sm rounded border bg-blue-600 text-white border-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "조회중..." : "조회"}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-4 text-xs text-slate-600">
          <span>그룹수: {groups.length.toLocaleString()}개</span>
          <span>건수: {count.toLocaleString()}건</span>
        </div>
      </div>

      {error ? (
        <div className="px-4 py-3 border-b bg-red-50 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="min-w-max w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="border-b border-r px-2 py-2 text-center font-semibold text-slate-700 bg-slate-50">
                No
              </th>
              {columns.map((column) => (
                <th
                  key={column}
                  className="border-b border-r px-2 py-2 text-left font-semibold text-slate-700 bg-slate-50 whitespace-nowrap"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  조회 중...
                </td>
              </tr>
            ) : !hasQueried ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  조회 버튼을 눌러 중복출고 데이터를 불러오세요.
                </td>
              </tr>
            ) : rows.length === 0 || groups.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  조회 결과가 없습니다.
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <FragmentGroup
                  key={group.id}
                  group={group}
                  columns={columns}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentGroup({
  group,
  columns,
}: {
  group: DuplicateGroup;
  columns: string[];
}) {
  return (
    <>
      <tr>
        <td
          colSpan={columns.length + 1}
          className="border-b border-r px-3 py-2 text-left text-xs font-semibold text-slate-700"
          style={{ backgroundColor: group.headerBg }}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{group.title}</span>
            <span>{group.count.toLocaleString()}건</span>
          </div>
        </td>
      </tr>

      {group.items.map((item) => (
        <tr
          key={`${group.id}-${item.row.id}`}
          className="hover:brightness-[0.99]"
          style={{ backgroundColor: group.rowBg }}
        >
          <td className="border-b border-r px-2 py-2 text-right text-slate-600 whitespace-nowrap">
            {item.displayNo}
          </td>

          {columns.map((column) => (
            <td
              key={`${group.id}-${item.row.id}-${column}`}
              className="border-b border-r px-2 py-2 text-slate-800 whitespace-nowrap"
              style={{ backgroundColor: group.rowBg }}
            >
              {stringifyCell(item.row.data?.[column])}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}