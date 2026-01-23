import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { gaksiMilColumns } from "@/devices/gaksiMil/columns/gaksiMilColumns";

async function ensureColumnsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_gaksimil_columns (
      id   INT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    INSERT INTO device_gaksimil_columns (id, data)
    VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);
}

/**
 * ✅ 핵심 정책
 * - base(=gaksiMilColumns)는 항상 base 순서를 유지한다.
 * - 저장된 order에 있던 "커스텀 컬럼"만 base 사이에 최대한 유지한다.
 */
function normalizeOrderFixedBase(userOrder: any, baseOrder: string[]) {
  const baseSet = new Set(baseOrder);

  const input = Array.isArray(userOrder) ? userOrder.map(String) : [];
  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (const k of input) {
    const key = String(k ?? "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(key);
  }

  const customInUserOrder = cleaned.filter((k) => !baseSet.has(k));

  const customBuckets: Record<string, string[]> = {};
  customBuckets["__TAIL__"] = [];

  let lastBase: string | "__TAIL__" = "__TAIL__";
  for (const k of cleaned) {
    if (baseSet.has(k)) {
      lastBase = k;
      if (!customBuckets[lastBase]) customBuckets[lastBase] = [];
    } else {
      if (!customBuckets[lastBase]) customBuckets[lastBase] = [];
      customBuckets[lastBase].push(k);
    }
  }

  const result: string[] = [];
  const customSeen = new Set<string>();

  for (const baseKey of baseOrder) {
    result.push(baseKey);

    const bucket = customBuckets[baseKey] ?? [];
    for (const c of bucket) {
      if (customSeen.has(c)) continue;
      customSeen.add(c);
      result.push(c);
    }
  }

  for (const c of customBuckets["__TAIL__"] ?? []) {
    if (customSeen.has(c)) continue;
    customSeen.add(c);
    result.push(c);
  }

  for (const c of customInUserOrder) {
    if (customSeen.has(c)) continue;
    customSeen.add(c);
    result.push(c);
  }

  return result;
}

async function saveOrder(order: string[]) {
  await query(
    `
    INSERT INTO device_gaksimil_columns (id, data)
    VALUES (1, $1)
    ON CONFLICT (id)
    DO UPDATE SET data = EXCLUDED.data
    `,
    [{ order }]
  );
}

async function loadOrder() {
  await ensureColumnsTable();

  const baseOrder = [...(gaksiMilColumns as unknown as string[])];

  const r = await query(`SELECT data FROM device_gaksimil_columns WHERE id=1 LIMIT 1`);
  const data = (r.rows[0]?.data ?? {}) as any;

  const order = normalizeOrderFixedBase(data?.order, baseOrder);

  // ✅ 매번 저장해서 base 위치가 깨져있던 DB order를 자동으로 정리(즉시 반영 안정화)
  await saveOrder(order);

  return order;
}

export async function GET() {
  try {
    const order = await loadOrder();
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    console.error("GET /api/devices/gaksiMil/columns error:", e);
    return NextResponse.json({ ok: false, error: "SERVER" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const name = String(body?.name ?? "").trim();
    const referenceKey = String(body?.referenceKey ?? "").trim();
    const position = body?.position === "before" ? "before" : "after";

    if (!name) return NextResponse.json({ ok: false, error: "missing_name" }, { status: 400 });
    if (!referenceKey)
      return NextResponse.json({ ok: false, error: "missing_referenceKey" }, { status: 400 });

    const baseOrder = [...(gaksiMilColumns as unknown as string[])];
    const baseSet = new Set(baseOrder);

    const cur = await loadOrder();
    if (cur.includes(name)) {
      return NextResponse.json({ ok: false, error: "already_exists" }, { status: 409 });
    }

    const next = [...cur];

    const refIdx = next.indexOf(referenceKey);
    const insertAt = refIdx < 0 ? next.length : position === "before" ? refIdx : refIdx + 1;
    next.splice(insertAt, 0, name);

    const normalized = normalizeOrderFixedBase(next, baseOrder);

    if (baseSet.has(name)) {
      return NextResponse.json({ ok: false, error: "cannot_add_base_name" }, { status: 400 });
    }

    await saveOrder(normalized);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/devices/gaksiMil/columns error:", e);
    return NextResponse.json({ ok: false, error: "SERVER" }, { status: 500 });
  }
}