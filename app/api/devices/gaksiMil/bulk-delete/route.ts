import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function n(v: any) {
  return String(v ?? "").trim();
}

function getSystemNoFromData(data: Record<string, any>) {
  return n(
    data?.["시스템 기기번호"] ??
      data?.["시스템기기번호"] ??
      data?.["기기번호"] ??
      data?.["기기 번호"]
  );
}

async function clearUnifiedDerivedBySystemNo(systemNoRaw: any) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return;

  const patch = {
    기종: null,
    "구매/렌탈": null,
    에러횟수: null,
    제품: null,
  };

  await query(
    `
    UPDATE unified
    SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb
    WHERE lower(trim(COALESCE(data->>'기기번호',''))) = $1
    `,
    [systemNo, JSON.stringify(patch)]
  );
}

async function existsGaksiMilBySystemNo(systemNoRaw: any) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return false;

  const r = await query(
    `
    SELECT 1
    FROM device_gaksimil
    WHERE lower(trim(COALESCE(
      data->>'시스템 기기번호',
      data->>'시스템기기번호',
      data->>'기기번호',
      data->>'기기 번호',
      ''
    ))) = $1
    LIMIT 1
    `,
    [systemNo]
  );

  return !!r.rows.length;
}

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
}

/**
 * POST /api/devices/gaksiMil/bulk-delete
 * body: { ids: number[] }
 */
export async function POST(req: Request) {
  try {
    await ensureGaksiMilTables();

    const body = await req.json().catch(() => ({}));

    const idsRaw = body?.ids;
    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "ids array is required" },
        { status: 400 }
      );
    }

    const ids = idsRaw
      .map((x: any) => Number(x))
      .filter((n: number) => Number.isFinite(n) && n > 0);

    if (ids.length !== idsRaw.length) {
      return NextResponse.json(
        { error: "INVALID_IDS", message: "ids must be positive numbers" },
        { status: 400 }
      );
    }

    const beforeR = await query(
      `
      SELECT id, data
      FROM device_gaksimil
      WHERE id = ANY($1::int[])
      `,
      [ids]
    );

    const deletedSystemNos = new Set<string>();
    for (const row of beforeR.rows ?? []) {
      const data = (row?.data ?? {}) as Record<string, any>;
      const systemNo = getSystemNoFromData(data).toLowerCase();
      if (systemNo) deletedSystemNos.add(systemNo);
    }

    const r = await query(`DELETE FROM device_gaksimil WHERE id = ANY($1::int[]) RETURNING id`, [
      ids,
    ]);

    for (const systemNo of deletedSystemNos) {
      const stillExists = await existsGaksiMilBySystemNo(systemNo);
      if (!stillExists) {
        await clearUnifiedDerivedBySystemNo(systemNo);
      }
    }

    return NextResponse.json({
      ok: true,
      deletedCount: r.rows.length,
      deletedIds: r.rows.map((x: any) => x.id),
    });
  } catch (e) {
    console.error("POST /api/devices/gaksiMil/bulk-delete error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}