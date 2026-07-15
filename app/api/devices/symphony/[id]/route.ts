import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getId(req: Request) {
  const url = new URL(req.url);
  return url.pathname.split("/").pop();
}

// ✅ 테이블 미생성으로 500 나는 것 방지: 자동 생성(있으면 무시)
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
}

export async function GET(req: Request) {
  try {
    await ensureSymphonyTables();

    const id = getId(req);
    const r = await query(`SELECT id, data FROM device_symphony WHERE id=$1`, [id]);

    if (!r.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(r.rows[0]);
  } catch (e) {
    console.error("GET /api/devices/symphony/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await ensureSymphonyTables();

    const id = getId(req);
    const body = await req.json().catch(() => ({}));

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    // ✅ 파생 컬럼은 저장 차단
    const patch: Record<string, any> = { ...body };
    delete patch["수리횟수"];
    delete patch["거래처"];
    delete patch["대여자명"];

    // ✅ 원자적 jsonb merge (동시 저장 덮어쓰기 완화)
    const r = await query(
      `
      UPDATE device_symphony
      SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb
      WHERE id = $2
      RETURNING id, data
      `,
      [JSON.stringify(patch), id]
    );

    if (!r.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(r.rows[0]);
  } catch (e) {
    console.error("PATCH /api/devices/symphony/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await ensureSymphonyTables();

    const id = getId(req);
    await query(`DELETE FROM device_symphony WHERE id=$1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/devices/symphony/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}