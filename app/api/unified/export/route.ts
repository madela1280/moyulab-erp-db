import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { unifiedColumns } from "@/unified/columns/unifiedColumns";
import { countExtensionRounds } from "@/views/unified/extensions/extensionCompute";

const BASE_STEP = 1000;

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toText(v: any) {
  return v == null ? "" : String(v);
}

function toStringList(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input.map(String).map((v) => v.trim()).filter(Boolean);
}

function uniqueList(list: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const k of list) {
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }

  return out;
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

  let out = rows.filter((r) => {
    for (const [key, arr] of Object.entries(selectedByKey)) {
      if (!arr || arr.length === 0) continue;

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

async function tableExists(tableName: string): Promise<boolean> {
  const r = await query(`SELECT to_regclass($1) AS reg`, [`public.${tableName}`]);
  return !!r.rows?.[0]?.reg;
}

async function getGlobalColumnOrder(): Promise<string[]> {
  const base = (unifiedColumns as unknown as string[]).map((key, i) => ({
    key,
    sort_key: (i + 1) * BASE_STEP,
  }));

  let custom: Array<{ key: string; sort_key: number }> = [];

  if (await tableExists("unified_custom_columns")) {
    const r = await query(
      `
      SELECT key, sort_key::numeric AS sort_key
      FROM unified_custom_columns
      ORDER BY sort_key ASC, key ASC
      `
    );

    custom = (r.rows || [])
      .map((x: any) => ({
        key: String(x?.key ?? "").trim(),
        sort_key: Number(x?.sort_key),
      }))
      .filter((x) => x.key && Number.isFinite(x.sort_key));
  }

  const combined = [...base, ...custom].sort((a, b) => a.sort_key - b.sort_key);

  return uniqueList(combined.map((x) => x.key));
}

function mergeUserOrderWithGlobal(userOrder: any, globalOrder: string[]) {
  const global = uniqueList(globalOrder);
  const gSet = new Set(global);

  const user = toStringList(userOrder);
  const result: string[] = [];
  const seen = new Set<string>();

  for (const k of user) {
    if (!gSet.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    result.push(k);
  }

  for (let i = 0; i < global.length; i++) {
    const k = global[i];
    if (seen.has(k)) continue;

    let inserted = false;

    for (let j = i - 1; j >= 0; j--) {
      const prev = global[j];
      const idx = result.indexOf(prev);
      if (idx >= 0) {
        result.splice(idx + 1, 0, k);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      for (let j = i + 1; j < global.length; j++) {
        const next = global[j];
        const idx = result.indexOf(next);
        if (idx >= 0) {
          result.splice(idx, 0, k);
          inserted = true;
          break;
        }
      }
    }

    if (!inserted) result.push(k);
    seen.add(k);
  }

  return result;
}

async function getUserColumnOrderOrGlobal(globalOrder: string[]) {
  const user = await getSessionUser().catch(() => null);

  if (!user?.username) {
    return globalOrder;
  }

  if (!(await tableExists("unified_grid_settings"))) {
    return globalOrder;
  }

  const r = await query(
    `
    SELECT column_order
    FROM unified_grid_settings
    WHERE username = $1
    `,
    [user.username]
  );

  if (!r.rows.length) return globalOrder;

  return mergeUserOrderWithGlobal(r.rows[0]?.column_order, globalOrder);
}

function buildHeader(args: {
  rows: Array<{ id: number; data: any }>;
  orderedColumns: string[];
}) {
  const { rows, orderedColumns } = args;

  const header = uniqueList(orderedColumns);
  const headerSet = new Set(header);

  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, any>;

    for (const k of Object.keys(data)) {
      if (!k) continue;
      if (k.startsWith("__")) continue;
      if (headerSet.has(k)) continue;

      headerSet.add(k);
      header.push(k);
    }
  }

  return header;
}

/**
 * POST /api/unified/export
 * body: { filter?: { filterState, sortState } }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const filter: ExportFilter = (body?.filter ?? {}) as any;

    const globalOrder = await getGlobalColumnOrder();
    const orderedColumns = await getUserColumnOrderOrGlobal(globalOrder);

    const r = await query(
      `
      SELECT u.id, u.data, o.sort_key
      FROM unified u
      JOIN unified_order o ON o.unified_id = u.id
      ORDER BY o.sort_key ASC, u.id ASC
      `
    );

    const filtered = applyFilterAndSort(r.rows as any[], filter);

    const header = buildHeader({
      rows: filtered,
      orderedColumns,
    });

    const lines: string[] = [];
    lines.push(header.map(csvEscape).join(","));

    for (const row of filtered) {
      const data = (row.data ?? {}) as Record<string, any>;

      const line = header.map((k) => {
        if (k === "총연장횟수") {
          return csvEscape(String(countExtensionRounds(data)));
        }

        if (k === "상태") {
          return csvEscape("");
        }

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