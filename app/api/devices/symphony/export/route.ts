import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { symphonyColumns } from "@/devices/symphony/columns/symphonyColumns";

async function ensureSymphonyTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_symphony (
      id   SERIAL PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS device_symphony_order (
      symphony_id INT PRIMARY KEY REFERENCES device_symphony(id) ON DELETE CASCADE,
      sort_key    NUMERIC NOT NULL
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_device_symphony_order_sort
    ON device_symphony_order(sort_key, symphony_id);
  `);

  // order 누락 보정
  await query(`
    INSERT INTO device_symphony_order (symphony_id, sort_key)
    SELECT s.id, (ROW_NUMBER() OVER (ORDER BY s.id)) * 1000
    FROM device_symphony s
    WHERE NOT EXISTS (
      SELECT 1 FROM device_symphony_order o WHERE o.symphony_id = s.id
    );
  `);
}

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toText(v: any) {
  return v == null ? "" : String(v);
}

function normalizeDeviceNo(v: any) {
  return String(v ?? "").trim();
}

function calcRepairCount(data: Record<string, any>) {
  const keys = ["수리이력1", "수리이력2", "수리이력3", "수리이력4", "수리이력5"];
  let c = 0;
  for (const k of keys) {
    const v = String(data?.[k] ?? "").trim();
    if (v) c++;
  }
  return c;
}

function formatWon(v: any) {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("ko-KR");
}

function buildRentingDeviceNoSet(unifiedRows: Array<{ data: any }>) {
  const set = new Set<string>();
  for (const r of unifiedRows) {
    const deviceNo = normalizeDeviceNo(r?.data?.["기기번호"]);
    if (!deviceNo) continue;

    const returned = normalizeDeviceNo(r?.data?.["반납완료일"]);
    if (!returned) set.add(deviceNo);
  }
  return set;
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
      const av = toText(a.data?.[sortKey]).trim();
      const bv = toText(b.data?.[sortKey]).trim();
      const cmp = av.localeCompare(bv, "ko-KR");
      return dir === "asc" ? cmp : -cmp;
    });
  }

  return out;
}

/**
 * POST /api/devices/symphony/export
 * body: { filter?: { filterState, sortState } }
 * - 필터 없으면 전체, 필터 있으면 필터된 것만 CSV로 다운로드
 * - 반환: text/csv (UTF-8 with BOM)
 */
export async function POST(req: Request) {
  try {
    await ensureSymphonyTables();

    const body = (await req.json().catch(() => ({}))) as any;
    const filter: ExportFilter = (body?.filter ?? {}) as any;

    // 심포니 데이터 전체 로드(정렬은 order 기준)
    const symR = await query(
      `
      SELECT s.id, s.data
      FROM device_symphony s
      JOIN device_symphony_order o ON o.symphony_id = s.id
      ORDER BY o.sort_key ASC, s.id ASC
      `
    );

    // 통합관리에서 대여중 매칭용
    const uniR = await query(`SELECT data FROM unified`);
    const rentingSet = buildRentingDeviceNoSet(uniR.rows as any[]);

    // 필터/정렬 적용
    const filtered = applyFilterAndSort(symR.rows as any[], filter);

    // CSV 생성(표 컬럼 순서대로)
    const header = [...symphonyColumns];
    const lines: string[] = [];
    lines.push(header.map(csvEscape).join(","));

    for (const row of filtered) {
      const data = (row.data ?? {}) as Record<string, any>;
      const deviceNo = normalizeDeviceNo(data?.["시스템 기기번호"]);

      const line = header.map((k) => {
        if (k === "수리횟수") return csvEscape(calcRepairCount(data));

        if (k === "유축기 위치") {
          const raw = toText(data?.[k]);
          const renting = deviceNo && rentingSet.has(deviceNo);
          if (!renting) return csvEscape(raw);
          return csvEscape(raw ? `${raw} (대여중)` : "대여중");
        }

        if (k === "원가") return csvEscape(formatWon(data?.[k]));

        return csvEscape(data?.[k]);
      });

      lines.push(line.join(","));
    }

    const csv = "\uFEFF" + lines.join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="symphony.csv"`,
      },
    });
  } catch (e) {
    console.error("POST /api/devices/symphony/export error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}