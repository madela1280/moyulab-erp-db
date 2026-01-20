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

/**
 * POST /api/devices/symphony/export
 * body: { filter?: any }
 * - 1차: filter는 미사용(전체 다운로드)
 * - 반환: text/csv (UTF-8 with BOM)
 */
export async function POST(req: Request) {
  try {
    await ensureSymphonyTables();
    await req.json().catch(() => ({})); // filter 확장 대비(현재는 무시)

    const r = await query(
      `
      SELECT s.id, s.data
      FROM device_symphony s
      JOIN device_symphony_order o ON o.symphony_id = s.id
      ORDER BY o.sort_key ASC, s.id ASC
      `
    );

    const header = [...symphonyColumns];

    const lines: string[] = [];
    lines.push(header.map(csvEscape).join(","));

    for (const row of r.rows) {
      const data = (row.data ?? {}) as Record<string, any>;
      lines.push(header.map((k) => csvEscape(data[k])).join(","));
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