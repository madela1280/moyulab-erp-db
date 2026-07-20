import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function n(v: any) {
  return String(v ?? "").trim();
}

// ✅ 락티나 bulk 수정 후 통합관리 파생 컬럼 즉시 동기화
async function syncUnifiedDerivedBySystemNo(systemNoRaw: any, sourceData: Record<string, any>) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return;

  const patch = {
    기종: n(sourceData?.["기종"]) || null,
    "구매/렌탈": n(sourceData?.["구매/렌탈"]) || null,
    제품: n(sourceData?.["제품명"]) || null,
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
    const updatedRows: Array<{ id: number; data: Record<string, any> }> = [];

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
          RETURNING id, data
          `,
          [JSON.stringify(patch), u.id]
        );

        if (r.rows.length) {
          updatedIds.push(Number(r.rows[0].id));
          updatedRows.push({
            id: Number(r.rows[0].id),
            data: (r.rows[0].data ?? {}) as Record<string, any>,
          });
        }
      }

      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }

    // ✅ bulk 수정된 시스템 기기번호들에 대해 통합관리 파생값 즉시 반영
    const seen = new Set<string>();
    for (const row of updatedRows) {
      const sysNo = n(row?.data?.["시스템 기기번호"]).toLowerCase();
      if (!sysNo || seen.has(sysNo)) continue;
      seen.add(sysNo);
      await syncUnifiedDerivedBySystemNo(sysNo, row.data);
    }

    return NextResponse.json({ ok: true, updatedCount: updatedIds.length, updatedIds }); 
  } catch (e) {
    console.error("POST /api/devices/lactina/bulk-patch error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}