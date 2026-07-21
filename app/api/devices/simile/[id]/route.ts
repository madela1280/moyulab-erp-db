import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getId(req: Request) {
  const url = new URL(req.url);
  return url.pathname.split("/").pop();
}

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

async function syncUnifiedDerivedBySystemNo(systemNoRaw: any, sourceData: Record<string, any>) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return;

  const patch = {
    기종: n(sourceData?.["기종"]) || null,
    "구매/렌탈": n(sourceData?.["구매/렌탈"]) || null,
    에러횟수: n(sourceData?.["에러횟수"]) || null,
    제품: n(sourceData?.["제품명"] ?? sourceData?.["제품"]) || null,
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

async function existsSimileBySystemNo(systemNoRaw: any) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return false;

  const r = await query(
    `
    SELECT 1
    FROM device_simile
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

async function ensureSimileTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_simile (
      id   SERIAL PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS device_simile_order (
      simile_id INT PRIMARY KEY REFERENCES device_simile(id) ON DELETE CASCADE,
      sort_key  NUMERIC NOT NULL
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_device_simile_order_sort
    ON device_simile_order(sort_key, simile_id);
  `);
}

export async function GET(req: Request) {
  try {
    await ensureSimileTables();

    const id = getId(req);
    const r = await query(`SELECT id, data FROM device_simile WHERE id=$1`, [id]);

    if (!r.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(r.rows[0]);
  } catch (e) {
    console.error("GET /api/devices/simile/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await ensureSimileTables();

    const id = getId(req);
    const body = await req.json().catch(() => ({}));

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    const beforeR = await query(`SELECT data FROM device_simile WHERE id=$1`, [id]);
    if (!beforeR.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const beforeData = (beforeR.rows[0]?.data ?? {}) as Record<string, any>;
    const beforeSystemNo = getSystemNoFromData(beforeData).toLowerCase();

    const patch: Record<string, any> = { ...body };
    delete patch["수리횟수"];
    delete patch["거래처"];
    delete patch["대여자명"];

    const r = await query(
      `
      UPDATE device_simile
      SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb
      WHERE id = $2
      RETURNING id, data
      `,
      [JSON.stringify(patch), id]
    );

    if (!r.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const saved = r.rows[0];
    const afterData = (saved?.data ?? {}) as Record<string, any>;
    const afterSystemNo = getSystemNoFromData(afterData).toLowerCase();

    if (afterSystemNo) {
      await syncUnifiedDerivedBySystemNo(afterSystemNo, afterData);
    }

    if (beforeSystemNo && beforeSystemNo !== afterSystemNo) {
      const stillExists = await existsSimileBySystemNo(beforeSystemNo);
      if (!stillExists) {
        await clearUnifiedDerivedBySystemNo(beforeSystemNo);
      }
    }

    return NextResponse.json(saved);
  } catch (e) {
    console.error("PATCH /api/devices/simile/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await ensureSimileTables();

    const id = getId(req);
    await query(`DELETE FROM device_simile WHERE id=$1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/devices/simile/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}