import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function n(v: any) {
  return String(v ?? "").trim();
}

// ✅ 심포니 bulk 수정 후 통합관리 파생 컬럼 즉시 동기화
async function syncUnifiedDerivedBySystemNo(systemNoRaw: any, sourceData: Record<string, any>) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return;

  const patch = {
    기종: n(sourceData?.["기종"]) || null,
    "구매/렌탈": n(sourceData?.["구매/렌탈"]) || null,
    에러횟수: n(sourceData?.["에러횟수"]) || null,
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

/**
 * POST /api/devices/symphony/bulk-patch
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
    await ensureSymphonyTables();

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

    // ✅ 파생 컬럼 저장 차단 + 원자적 jsonb merge(동시 수정 안정화)
    const sanitized = updates.map((u) => {
      const p: Record<string, any> = { ...(u.patch ?? {}) };
      delete p["수리횟수"];
      delete p["거래처"];
      delete p["대여자명"];
      return { id: u.id, patch: p };
    });

   const r = await query(
      `
      WITH v AS (
        SELECT
          (x->>'id')::int AS id,
          x->'patch'       AS patch
        FROM jsonb_array_elements($1::jsonb) AS x
      )
      UPDATE device_symphony s
      SET data = COALESCE(s.data, '{}'::jsonb) || COALESCE(v.patch, '{}'::jsonb)
      FROM v
      WHERE s.id = v.id
      RETURNING s.id, s.data
      `,
      [JSON.stringify(sanitized)]
    );

    const updatedIds = (r.rows ?? []).map((x: any) => Number(x.id));

    // ✅ bulk 수정된 시스템 기기번호들에 대해 통합관리 파생값 즉시 반영
    const seen = new Set<string>();
    for (const row of r.rows ?? []) {
      const data = (row?.data ?? {}) as Record<string, any>;
      const sysNo = n(data["시스템 기기번호"]).toLowerCase();
      if (!sysNo || seen.has(sysNo)) continue;
      seen.add(sysNo);
      await syncUnifiedDerivedBySystemNo(sysNo, data);
    }

    return NextResponse.json({ ok: true, updatedCount: updatedIds.length, updatedIds }); 
  } catch (e) {
    console.error("POST /api/devices/symphony/bulk-patch error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}