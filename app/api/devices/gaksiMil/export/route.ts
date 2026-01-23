import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { gaksiMilColumns } from "@/devices/gaksiMil/columns/gaksiMilColumns";
import { setHasDeviceNoCI, mapGetDeviceNoCI, normalizeDeviceNo } from "@/lib/deviceNo";

async function ensureGaksiMilTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_gaksimil (
      id   SERIAL PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS device_gaksimil_order (
      gaksimil_id INT PRIMARY KEY REFERENCES device_gaksimil(id) ON DELETE CASCADE,
      sort_key    NUMERIC NOT NULL
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_device_gaksimil_order_sort
    ON device_gaksimil_order(sort_key, gaksimil_id);
  `);

  // order 누락 보정
  await query(`
    INSERT INTO device_gaksimil_order (gaksimil_id, sort_key)
    SELECT s.id, (ROW_NUMBER() OVER (ORDER BY s.id)) * 1000
    FROM device_gaksimil s
    WHERE NOT EXISTS (
      SELECT 1 FROM device_gaksimil_order o WHERE o.gaksimil_id = s.id
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

function stripRentingMarker(v: any) {
  const raw = String(v ?? "");
  if (!raw) return "";

  let s = raw;
  s = s.replace(/\(대여중\)/g, "");
  s = s.replace(/\s*대여중\s*/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
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

function buildRentingInfo(unifiedRows: Array<{ data: any }>) {
  const rentingSet = new Set<string>();
  const infoByDeviceNo: Record<string, { 거래처분류: string; 수취인명: string }> = {};

  for (const r of unifiedRows) {
    const deviceNo = normalizeDeviceNo(r?.data?.["기기번호"]);
    if (!deviceNo) continue;

    const returned = normalizeDeviceNo(r?.data?.["반납완료일"]);
    if (returned) continue;

    rentingSet.add(deviceNo);

    infoByDeviceNo[deviceNo] = {
      거래처분류: toText(r?.data?.["거래처분류"]).trim(),
      수취인명: toText(r?.data?.["수취인명"]).trim(),
    };
  }

  return { rentingSet, infoByDeviceNo };
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
 * POST /api/devices/gaksiMil/export
 * body: { filter?: { filterState, sortState } }
 * - 반환: text/csv (UTF-8 with BOM)
 */
export async function POST(req: Request) {
  try {
    await ensureGaksiMilTables();

    const body = (await req.json().catch(() => ({}))) as any;
    const filter: ExportFilter = (body?.filter ?? {}) as any;

    const devR = await query(
      `
      SELECT s.id, s.data
      FROM device_gaksimil s
      JOIN device_gaksimil_order o ON o.gaksimil_id = s.id
      ORDER BY o.sort_key ASC, s.id ASC
      `
    );

    const uniR = await query(`SELECT data FROM unified`);
    const { rentingSet, infoByDeviceNo } = buildRentingInfo(uniR.rows as any[]);

    const filtered = applyFilterAndSort(devR.rows as any[], filter);

    const header = [...gaksiMilColumns];
    const lines: string[] = [];
    lines.push(header.map(csvEscape).join(","));

    for (const row of filtered) {
      const data = (row.data ?? {}) as Record<string, any>;
      const deviceNo = normalizeDeviceNo(data?.["시스템 기기번호"]);
      const renting = !!deviceNo && setHasDeviceNoCI(rentingSet, deviceNo);
      const rentalInfo = deviceNo ? mapGetDeviceNoCI(infoByDeviceNo, deviceNo) : undefined;

      const line = header.map((k) => {
        if (k === "수리횟수") return csvEscape(calcRepairCount(data));

        if (k === "유축기 위치") {
          const raw0 = toText(data?.[k]);
          const raw = stripRentingMarker(raw0);
          if (!renting) return csvEscape(raw);
          return csvEscape(raw ? `${raw} (대여중)` : "대여중");
        }

        if (k === "거래처") {
          if (renting) return csvEscape(rentalInfo?.거래처분류 ?? "");
          return csvEscape(data?.[k]);
        }

        if (k === "대여자명") {
          if (renting) return csvEscape(rentalInfo?.수취인명 ?? "");
          return csvEscape(data?.[k]);
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
        "Content-Disposition": `attachment; filename="gaksimil.csv"`,
      },
    });
  } catch (e) {
    console.error("POST /api/devices/gaksiMil/export error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}