"use client";

import { useEffect, useMemo, useState } from "react";

type UnreturnedRow = {
  id: number;
  data: Record<string, unknown> | null;
};

type UnreturnedResponse = {
  ok: boolean;
  기준일자?: string;
  count?: number;
  rows?: UnreturnedRow[];
  error?: string;
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

function parseFilenameFromDisposition(disposition: string | null): string {
  if (!disposition) return "unreturned.csv";

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

  return "unreturned.csv";
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

export default function UnreturnedView() {
  const [baseDate, setBaseDate] = useState<string>(getTodayYmd);
  const [rows, setRows] = useState<UnreturnedRow[]>([]);
  const [count, setCount] = useState<number>(0);
  const [loadedBaseDate, setLoadedBaseDate] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [downloadLoading, setDownloadLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const columns = useMemo(() => buildColumns(rows), [rows]);

  const loadRows = async (dateText?: string) => {
    const targetDate = (dateText ?? baseDate).trim();

    if (!targetDate) {
      setError("기준일자를 입력해주세요.");
      setRows([]);
      setCount(0);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/error-check/unreturned?기준일자=${encodeURIComponent(targetDate)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = (await res.json()) as UnreturnedResponse;

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "미회수 데이터를 조회하지 못했습니다.");
      }

      const nextRows = Array.isArray(data.rows) ? data.rows : [];
      setRows(nextRows);
      setCount(typeof data.count === "number" ? data.count : nextRows.length);
      setLoadedBaseDate(data.기준일자 || targetDate);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "미회수 데이터를 조회하지 못했습니다.";
      setError(message);
      setRows([]);
      setCount(0);
      setLoadedBaseDate("");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    const targetDate = baseDate.trim();

    if (!targetDate) {
      setError("기준일자를 입력해주세요.");
      return;
    }

    setDownloadLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/error-check/unreturned/export?기준일자=${encodeURIComponent(targetDate)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const errorJson = await safeReadJson(response);
        const message =
          typeof errorJson.message === "string"
            ? errorJson.message
            : "미회수 다운로드 중 오류가 발생했습니다.";
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
        err instanceof Error ? err.message : "미회수 다운로드 중 오류가 발생했습니다.";
      setError(message);
    } finally {
      setDownloadLoading(false);
    }
  };

  useEffect(() => {
    void loadRows(baseDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full h-full min-h-0 flex flex-col overflow-hidden bg-white border rounded">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white">
        <div className="text-sm font-semibold text-slate-800">미회수</div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">기준일자</span>
          <input
            type="date"
            value={baseDate}
            onChange={(e) => setBaseDate(e.target.value)}
            className="h-8 border rounded px-2 text-sm bg-white"
          />
          <button
            type="button"
            onClick={() => void loadRows()}
            disabled={loading}
            className="h-8 px-3 text-sm rounded border bg-blue-600 text-white border-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            조회
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={downloadLoading}
            className="h-8 px-3 text-sm rounded border bg-white text-slate-800 border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            {downloadLoading ? "다운로드중..." : "다운로드"}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-4 text-xs text-slate-600">
          <span>기준일자: {loadedBaseDate || "-"}</span>
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
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  조회 결과가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="border-b border-r px-2 py-2 text-right text-slate-600 whitespace-nowrap">
                    {index + 1}
                  </td>

                  {columns.map((column) => (
                    <td
                      key={`${row.id}-${column}`}
                      className="border-b border-r px-2 py-2 text-slate-800 whitespace-nowrap"
                    >
                      {stringifyCell(row.data?.[column])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}