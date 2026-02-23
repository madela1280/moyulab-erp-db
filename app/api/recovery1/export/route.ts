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

    const header = [...unifiedColumns];
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