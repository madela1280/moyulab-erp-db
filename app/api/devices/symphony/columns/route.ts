import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { symphonyColumns } from "@/devices/symphony/columns/symphonyColumns";

async function ensureColumnsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_symphony_columns (
      id   INT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  // 전역 1행(id=1) 확보
  await query(`
    INSERT INTO device_symphony_columns (id, data)
    VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);
}

function normalizeOrder(input: any) {
  const base = [...(symphonyColumns as unknown as string[])];

  const arr = Array.isArray(input) ? input.map(String) : [];
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const k of arr) {
    const key = String(k).trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(key);
  }

  // base 컬럼이 누락되면 원래 순서 기준으로 끼워넣기
  for (const k of base) {
    if (!seen.has(k)) {
      cleaned.push(k);
      seen.add(k);
    }
  }

  return cleaned;
}

async function loadOrder() {
  await ensureColumnsTable();

  const r = await query(`SELECT data FROM device_symphony_columns WHERE id=1 LIMIT 1`);
  const data = (r.rows[0]?.data ?? {}) as any;
  const order = normalizeOrder(data?.order);

  // 비어있으면 base로 초기화
  if (!Array.isArray(data?.order) || data.order.length === 0) {
    await saveOrder(order);
  }

  return order;
}

async function saveOrder(order: string[]) {
  await query(
    `
    INSERT INTO device_symphony_columns (id, data)
    VALUES (1, $1)
    ON CONFLICT (id)
    DO UPDATE SET data = EXCLUDED.data
    `,
    [{ order }]
  );
}

/**
 * GET /api/devices/symphony/columns
 * -> { ok:true, order: string[] }
 */
export async function GET() {
  try {
    const order = await loadOrder();
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    console.error("GET /api/devices/symphony/columns error:", e);
    return NextResponse.json({ ok: false, error: "SERVER" }, { status: 500 });
  }
}

/**
 * POST /api/devices/symphony/columns
 * body: { name: string, referenceKey: string, position: "after"|"before" }
 * -> 전역 컬럼 목록에 새 컬럼을 삽입
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const name = String(body?.name ?? "").trim();
    const referenceKey = String(body?.referenceKey ?? "").trim();
    const position = body?.position === "before" ? "before" : "after";

    if (!name) {
      return NextResponse.json({ ok: false, error: "missing_name" }, { status: 400 });
    }
    if (!referenceKey) {
      return NextResponse.json({ ok: false, error: "missing_referenceKey" }, { status: 400 });
    }

    const order = await loadOrder();

    if (order.includes(name)) {
      return NextResponse.json({ ok: false, error: "already_exists" }, { status: 409 });
    }

    const refIdx = order.indexOf(referenceKey);
    const next = [...order];

    if (refIdx < 0) {
      // 기준 컬럼이 없으면 맨 뒤
      next.push(name);
    } else {
      const insertAt = position === "before" ? refIdx : refIdx + 1;
      next.splice(insertAt, 0, name);
    }

    await saveOrder(normalizeOrder(next));

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/devices/symphony/columns error:", e);
    return NextResponse.json({ ok: false, error: "SERVER" }, { status: 500 });
  }
}