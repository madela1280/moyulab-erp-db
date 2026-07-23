import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unifiedColumns } from "@/unified/columns/unifiedColumns";

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toText(v: any) {
  return v == null ? "" : String(v);
}

const RECOVERY_DATE_FILTER_KEYS = new Set([
  "택배발송일",
  "시작일",
  "종료일",
  "반납요청일",
  "반납완료일",
  "신청일",
]);

function parseYmdParts(value: string): { y: number; m: number; d: number } | null {
  const s = String(value ?? "").trim();
  if (!s) return null;

  const m = s.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

  return { y, m: mo, d };
}

function parseDateFilterToken(token: string): { y: number; m: number | null } | null {
  const s = String(token ?? "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})년$/);
  if (m) return { y: Number(m[1]), m: null };

  m = s.match(/^(\d{4})년\s*(\d{1,2})월$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return { y, m: mo };
  }

  return null;
}

function matchDateTokenValue(cellValue: string, token: string) {
  const parsedToken = parseDateFilterToken(token);
  if (!parsedToken) return String(cellValue ?? "") === String(token ?? "");

  const parsedDate = parseYmdParts(cellValue);
  if (!parsedDate) return false;

  if (parsedDate.y !== parsedToken.y) return false;
  if (parsedToken.m != null && parsedDate.m !== parsedToken.m) return false;
  return true;
}

type ExportFilter = {
  filterState?: {
    selectedByKey?: Record<string, string[]>;
    searchByKey?: Record<string, string>;
  };
  sortState?: { key?: string | null; dir?: "asc" | "desc" };
};

function applyFilterAndSort(rows: Array<{ id: number; data: any }>, filter: ExportFilter) {
  const selectedByKey = filter?.filterState?.selectedByKey ?? {};
  const searchByKey = filter?.filterState?.searchByKey ?? {};

  let out = rows.filter((r) => {
    for (const [key, arr] of Object.entries(selectedByKey)) {
      if (!arr || arr.length === 0) continue;

      const v = toText(r.data?.[key]);
      if (RECOVERY_DATE_FILTER_KEYS.has(key)) {
        const matched = arr.some((token) => matchDateTokenValue(v, String(token ?? "")));
        if (!matched) return false;
        continue;
      }

      if (!arr.includes(v)) return false;
    }

    for (const [key, q] of Object.entries(searchByKey)) {
      const qq = String(q ?? "").trim();
      if (!qq) continue;
      const v = toText(r.data?.[key]).toLowerCase();
      if (!v.includes(qq.toLowerCase())) return false;
    }

    return true;
  });

  const sortKey = filter?.sortState?.key ?? null;
  const dir = filter?.sortState?.dir === "desc" ? "desc" : "asc";

  if (sortKey) {
    out = [...out].sort((a, b) => {
      const av = toText(a.data?.[sortKey]).trim();
      const bv = toText(b.data?.[sortKey]).trim();
      const cmp = av.localeCompare(bv, "ko-KR");
      return dir === "asc" ? cmp : -cmp;
    });
  }

  return out;
}

/**
 * POST /api/recovery1/export
 * body: { filter?: { filterState, sortState } }
 * - 반환: text/csv (UTF-8 with BOM)
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const filter: ExportFilter = (body?.filter ?? {}) as any;

    // recovery1 전체 로드(order 기준)
    const r = await query(
      `
      SELECT r.id, r.data, o.sort_key
      FROM recovery1 r
      JOIN recovery1_order o ON o.recovery1_id = r.id
      ORDER BY o.sort_key ASC, r.id ASC
      `
    );

    const filtered = applyFilterAndSort(r.rows as any[], filter);

// CSV 생성(동적 컬럼 포함)
// 1) 기본 컬럼 순서(unifiedColumns) 유지
// 2) 데이터에만 존재하는 추가 컬럼은 뒤에 붙임
const baseHeader: string[] = [...unifiedColumns];
const extraKeySet = new Set<string>();

for (const row of filtered) {
  const data = (row.data ?? {}) as Record<string, any>;
  for (const k of Object.keys(data)) {
    if (!baseHeader.includes(k)) extraKeySet.add(k);
  }
}

const extraHeader = Array.from(extraKeySet);
const header = [...baseHeader, ...extraHeader];

const lines: string[] = [];
lines.push(header.map(csvEscape).join(","));

for (const row of filtered) {
  const data = (row.data ?? {}) as Record<string, any>;
  const line = header.map((k) => csvEscape(data?.[k]));
  lines.push(line.join(","));
}

    const csv = "\uFEFF" + lines.join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="recovery1.csv"`,
      },
    });
  } catch (e) {
    console.error("POST /api/recovery1/export error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}