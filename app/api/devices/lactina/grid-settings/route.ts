import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * 락티나 그리드 설정 저장/로드 (브라우저 저장소 금지 → DB 저장)
 * - 단일 row(id=1)로 관리
 *
 * GET  /api/devices/lactina/grid-settings  -> { columnOrder, colWidthUnitByKey }
 * POST /api/devices/lactina/grid-settings  -> upsert
 */

async function ensureSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_lactina_grid_settings (
      id   INT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  // 기본 row(id=1) 없으면 만들어둠
  await query(`
    INSERT INTO device_lactina_grid_settings (id, data)
    VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);
}

function sanitizeColumnOrder(input: any) {
  const arr = Array.isArray(input) ? input : [];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const v of arr) {
    const k = String(v ?? "").trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * ✅ 강제 위치 고정(요구사항)
 * - "거래처", "대여자명"은 항상
 *   "유축기 위치" 바로 뒤, "폐기" 바로 앞(= 유축기 위치와 폐기 사이)에 위치해야 한다.
 */
function enforceFixedDerivedColumns(order: string[]) {
  const FIXED = ["거래처", "대여자명"] as const;
  const FIXED_SET = new Set<string>(FIXED);

  const presentFixed = FIXED.filter((k) => order.includes(k));
  if (!presentFixed.length) return order;

  const cleaned = order.filter((k) => !FIXED_SET.has(k));

  const idxPump = cleaned.indexOf("유축기 위치");
  if (idxPump >= 0) {
    cleaned.splice(idxPump + 1, 0, ...presentFixed);
    return cleaned;
  }

  const idxDispose = cleaned.indexOf("폐기");
  if (idxDispose >= 0) {
    cleaned.splice(idxDispose, 0, ...presentFixed);
    return cleaned;
  }

  return [...cleaned, ...presentFixed];
}

function sanitizeColWidthUnitByKey(input: any) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, number>;
}

export async function GET() {
  try {
    await ensureSettingsTable();

    const r = await query(`SELECT data FROM device_lactina_grid_settings WHERE id=1 LIMIT 1`);

    const data = (r.rows[0]?.data ?? {}) as any;

    const columnOrderRaw = Array.isArray(data.columnOrder) ? data.columnOrder : [];
    const columnOrder = enforceFixedDerivedColumns(sanitizeColumnOrder(columnOrderRaw));

    const colWidthUnitByKey =
      data.colWidthUnitByKey && typeof data.colWidthUnitByKey === "object"
        ? data.colWidthUnitByKey
        : {};

    return NextResponse.json({
      columnOrder,
      colWidthUnitByKey,
    });
  } catch (e) {
    console.error("GET /api/devices/lactina/grid-settings error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSettingsTable();

    const body = await req.json().catch(() => ({}));

    const nextOrder = enforceFixedDerivedColumns(sanitizeColumnOrder(body?.columnOrder));
    const nextWidths = sanitizeColWidthUnitByKey(body?.colWidthUnitByKey);

    const payload = {
      columnOrder: nextOrder,
      colWidthUnitByKey: nextWidths,
    };

    await query(
      `
      INSERT INTO device_lactina_grid_settings (id, data)
      VALUES (1, $1)
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data
      `,
      [payload]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/devices/lactina/grid-settings error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}