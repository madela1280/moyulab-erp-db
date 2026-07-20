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

// ✅ 심포니 bulk 수정 후 통합관리 파생 컬럼 즉시 동기화
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

async function existsSymphonyBySystemNo(systemNoRaw: any) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return false;

  const r = await query(
    `
    SELECT 1
    FROM device_symphony
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

    const ids = updates.map((u) => u.id);

    // 변경 전 시스템기기번호 스냅샷
    const beforeR = await query(
      `
      SELECT id, data
      FROM device_symphony
      WHERE id = ANY($1::int[])
      `,
      [ids]
    );
    const beforeMap = new Map<number, Record<string, any>>();
    for (const row of beforeR.rows ?? []) {
      beforeMap.set(Number(row.id), (row.data ?? {}) as Record<string, any>);
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

    // 신규/현재 시스템기기번호 동기화
    const seenAfter = new Set<string>();
    // 변경 전 번호 중 cleanup 후보
    const cleanupCandidates = new Set<string>();

    for (const row of r.rows ?? []) {
      const id = Number(row.id);
      const afterData = (row?.data ?? {}) as Record<string, any>;
      const beforeData = beforeMap.get(id) ?? {};

      const beforeNo = getSystemNoFromData(beforeData).toLowerCase();
      const afterNo = getSystemNoFromData(afterData).toLowerCase();

      if (afterNo && !seenAfter.has(afterNo)) {
        seenAfter.add(afterNo);
        await syncUnifiedDerivedBySystemNo(afterNo, afterData);
      }

      if (beforeNo && beforeNo !== afterNo) {
        cleanupCandidates.add(beforeNo);
      }
    }

    // 시스템기기번호 변경/삭제로 orphan된 번호 cleanup
    for (const oldNo of cleanupCandidates) {
      const stillExists = await existsSymphonyBySystemNo(oldNo);
      if (!stillExists) {
        await clearUnifiedDerivedBySystemNo(oldNo);
      }
    }

    return NextResponse.json({ ok: true, updatedCount: updatedIds.length, updatedIds });    
  } catch (e) {
    console.error("POST /api/devices/symphony/bulk-patch error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}