import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unifiedColumns } from "@/unified/columns/unifiedColumns";
import { countExtensionRounds } from "@/views/unified/extensions/extensionCompute";

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toText(v: any) {
  return v == null ? "" : String(v);
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

  // filter
  let out = rows.filter((r) => {
    for (const [key, arr] of Object.entries(selectedByKey)) {
      if (!arr || arr.length === 0) continue;

      // ✅ "총연장횟수"는 파생값 기준으로 필터링
      if (key === "총연장횟수") {
        const cnt = String(countExtensionRounds(r.data ?? {}));
        if (!arr.includes(cnt)) return false;
        continue;
      }

      const v = toText(r.data?.[key]);
      if (!arr.includes(v)) return false;
    }
    return true;
  });

  // sort (text)
  const sortKey = filter?.sortState?.key ?? null;
  const dir = filter?.sortState?.dir === "desc" ? "desc" : "asc";

  if (sortKey) {
    out = [...out].sort((a, b) => {
      const av =
        sortKey === "총연장횟수"
          ? String(countExtensionRounds(a.data ?? {}))
          : toText(a.data?.[sortKey]).trim();
      const bv =
        sortKey === "총연장횟수"
          ? String(countExtensionRounds(b.data ?? {}))
          : toText(b.data?.[sortKey]).trim();

      const cmp = av.localeCompare(bv, "ko-KR");
      return dir === "asc" ? cmp : -cmp;
    });
  }

  return out;
}

/**
 * POST /api/unified/export
 * body: { filter?: { filterState, sortState } }
 * - 필터 없으면 전체, 필터 있으면 필터된 것만 CSV로 다운로드
 * - 반환: text/csv (UTF-8 with BOM)
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const filter: ExportFilter = (body?.filter ?? {}) as any;

    // unified 전체 로드(정렬은 unified_order 기준)
    const r = await query(
      `
      SELECT u.id, u.data, o.sort_key
      FROM unified u
      JOIN unified_order o ON o.unified_id = u.id
      ORDER BY o.sort_key ASC, u.id ASC
      `
    );

    const filtered = applyFilterAndSort(r.rows as any[], filter);

    // CSV 생성(동적 컬럼 포함)
    // 1) 기본 컬럼 순서(unifiedColumns)를 우선 유지
    // 2) 데이터에만 존재하는 추가 컬럼(커스텀/6~7차 등)을 뒤에 붙임
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

      const line = header.map((k) => {
        // ✅ 파생 컬럼 처리
        if (k === "총연장횟수") return csvEscape(String(countExtensionRounds(data)));

        // "상태"는 DB에 저장하지 않는 파생 표시 컬럼이므로 export에서는 빈값(또는 raw) 처리
        if (k === "상태") return csvEscape("");

        return csvEscape(data?.[k]);
      });

      lines.push(line.join(","));
    }

    const csv = "\uFEFF" + lines.join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="unified.csv"`,
      },
    });
  } catch (e) {
    console.error("POST /api/unified/export error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}