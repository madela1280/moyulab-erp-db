import { NextResponse } from "next/server";
import { query } from "@/lib/db";

async function ensureLactinaTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_lactina (
      id   SERIAL PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS device_lactina_order (
      lactina_id INT PRIMARY KEY REFERENCES device_lactina(id) ON DELETE CASCADE,
      sort_key   NUMERIC NOT NULL
    );
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_device_lactina_order_sort
    ON device_lactina_order(sort_key, lactina_id);
  `);
}

/**
 * POST /api/devices/lactina/bulk-patch
 * body:
 * {
 *   updates: Array<{ id: number, patch: Record<string, any> }>
 * }
 *
 * - patch는 merge로 반영 (null도 그대로 저장)
 * - 트랜잭션으로 일괄 반영(안전)
 */
export async function POST(req: Request) {
  try {
    await ensureLactinaTables();

    const body = await req.json().catch(() => ({}));
    const updatesRaw = body?.updates;

    if (!Array.isArray(updatesRaw) || updatesRaw.length === 0) {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "updates array is required" },
        { status: 400 }
      );
    }

    const updates = updatesRaw.map((u: any) => ({
      id: Number(u?.id),
      patch: u?.patch,
    }));

    for (const u of updates) {
      if (!Number.isFinite(u.id) || u.id <= 0) {
        return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
      }
      if (!u.patch || typeof u.patch !== "object" || Array.isArray(u.patch)) {
        return NextResponse.json({ error: "INVALID_PATCH" }, { status: 400 });
      }
    }

    const updatedIds: number[] = [];

    await query("BEGIN");
    try {
      for (const u of updates) {
        const patch: Record<string, any> = { ...(u.patch as Record<string, any>) };

        // 파생/읽기전용 컬럼 저장 차단
        delete patch["수리횟수"];
        delete patch["거래처"];
        delete patch["대여자명"];

        if (!Object.keys(patch).length) continue;

        const r = await query(
          `
          UPDATE device_lactina
          SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb
          WHERE id = $2
          RETURNING id
          `,
          [JSON.stringify(patch), u.id]
        );

        if (r.rows.length) updatedIds.push(Number(r.rows[0].id));
      }

      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }

    return NextResponse.json({ ok: true, updatedCount: updatedIds.length, updatedIds });
  } catch (e) {
    console.error("POST /api/devices/lactina/bulk-patch error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}