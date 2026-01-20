import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { symphonyColumns } from "@/devices/symphony/columns/symphonyColumns";

function csvEscape(v: any) {
  const s = v == null ? "" : String(v);
  // 쉼표/개행/따옴표가 있으면 "..."로 감싸고 내부 따옴표는 ""로 이스케이프
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * POST /api/devices/symphony/export
 * body: { filter?: any }
 * - 1차: filter는 무시(전체 다운로드), 추후 확장
 * - 반환: text/csv (UTF-8 with BOM)
 */
export async function POST(req: Request) {
  // const body = await req.json().catch(() => ({})); // 추후 필터 확장 시 사용

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
    const line = header.map((k) => csvEscape(data[k]));
    lines.push(line.join(","));
  }

  const csv = "\uFEFF" + lines.join("\r\n"); // BOM 포함(엑셀 한글 깨짐 방지)

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="symphony.csv"`,
    },
  });
}