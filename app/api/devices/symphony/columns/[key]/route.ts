import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { symphonyColumns } from "@/devices/symphony/columns/symphonyColumns";

function getKey(req: Request) {
  const url = new URL(req.url);
  const raw = url.pathname.split("/").pop() || "";
  return decodeURIComponent(raw);
}

async function ensureColumnsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_symphony_columns (
      id   INT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    INSERT INTO device_symphony_columns (id, data)
    VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);
}

function normalizeOrder(input: any) {
  const base = new Set<string>([...(symphonyColumns as unknown as string[])]);
  const arr = Array.isArray(input) ? input.map(String) : [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const k of arr) {
    const key = String(k).trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }

  // base 컬럼들은 항상 유지(삭제 금지)
  for (const k of base) {
    if (!seen.has(k)) out.push(k);
  }

  return out;
}

async function loadOrder() {
  await ensureColumnsTable();
  const r = await query(`SELECT data FROM device_symphony_columns WHERE id=1 LIMIT 1`);
  const data = (r.rows[0]?.data ?? {}) as any;
  return normalizeOrder(data?.order);
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
 * DELETE /api/devices/symphony/columns/:key
 * - base 컬럼(symphonyColumns)은 삭제 금지
 */
export async function DELETE(req: Request) {
  try {
    const key = getKey(req).trim();
    if (!key) {
      return NextResponse.json({ ok: false, error: "missing_key" }, { status: 400 });
    }

    const base = new Set<string>([...(symphonyColumns as unknown as string[])]);
    if (base.has(key)) {
      return NextResponse.json({ ok: false, error: "base_column_cannot_delete" }, { status: 400 });
    }

    const order = await loadOrder();
    const next = order.filter((x) => x !== key);

    await saveOrder(normalizeOrder(next));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/devices/symphony/columns/[key] error:", e);
    return NextResponse.json({ ok: false, error: "SERVER" }, { status: 500 });
  }
}