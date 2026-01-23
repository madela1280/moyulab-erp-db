import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { gaksiMilColumns } from "@/devices/gaksiMil/columns/gaksiMilColumns";

function getKey(req: Request) {
  const url = new URL(req.url);
  const raw = url.pathname.split("/").pop() || "";
  return decodeURIComponent(raw);
}

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
 * base(=gaksiMilColumns)는 항상 base 순서 고정.
 * custom 컬럼만 base 사이에 최대한 유지.
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

  // 항상 보정 저장(위치 깨짐 방지)
  await saveOrder(order);

  return order;
}

/**
 * DELETE /api/devices/gaksiMil/columns/:key
 * - base 컬럼(gaksiMilColumns)은 삭제 금지
 */
export async function DELETE(req: Request) {
  try {
    const key = getKey(req).trim();
    if (!key) {
      return NextResponse.json({ ok: false, error: "missing_key" }, { status: 400 });
    }

    const baseSet = new Set<string>([...(gaksiMilColumns as unknown as string[])]);
    if (baseSet.has(key)) {
      return NextResponse.json({ ok: false, error: "base_column_cannot_delete" }, { status: 400 });
    }

    const cur = await loadOrder();
    const next = cur.filter((x) => x !== key);

    const baseOrder = [...(gaksiMilColumns as unknown as string[])];
    const normalized = normalizeOrderFixedBase(next, baseOrder);

    await saveOrder(normalized);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/devices/gaksiMil/columns/[key] error:", e);
    return NextResponse.json({ ok: false, error: "SERVER" }, { status: 500 });
  }
}