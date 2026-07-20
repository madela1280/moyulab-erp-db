import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function n(v: any) {
  return String(v ?? "").trim();
}

function hasOwn(obj: any, key: string) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function getSystemNoFromData(data: Record<string, any>) {
  return n(
    data?.["시스템 기기번호"] ??
      data?.["시스템기기번호"] ??
      data?.["기기번호"] ??
      data?.["기기 번호"]
  );
}

// ✅ 락티나 bulk 수정 후 통합관리 파생 컬럼 즉시 동기화
// - 제품명/제품 키 혼용을 모두 수용해서 누락 방지
async function syncUnifiedDerivedBySystemNo(systemNoRaw: any, sourceData: Record<string, any>) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return;

  const productFromName = n(sourceData?.["제품명"]);
  const productFromProduct = n(sourceData?.["제품"]);
  const product = productFromName || productFromProduct;

  const patch: Record<string, any> = {
    기종: n(sourceData?.["기종"]) || null,
    "구매/렌탈": n(sourceData?.["구매/렌탈"]) || null,
  };

  if (hasOwn(sourceData, "제품명") || hasOwn(sourceData, "제품")) {
    patch["제품"] = product || null;
  }

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

async function existsLactinaBySystemNo(systemNoRaw: any) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return false;

  const r = await query(
    `
    SELECT 1
    FROM device_lactina
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

    const ids = updates.map((u) => u.id);

    // 변경 전 시스템기기번호 스냅샷
    const beforeR = await query(
      `
      SELECT id, data
      FROM device_lactina
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
      UPDATE device_lactina s
      SET data = COALESCE(s.data, '{}'::jsonb) || COALESCE(v.patch, '{}'::jsonb)
      FROM v
      WHERE s.id = v.id
      RETURNING s.id, s.data
      `,
      [JSON.stringify(sanitized)]
    );

    const updatedIds = (r.rows ?? []).map((x: any) => Number(x.id));

    const seenAfter = new Set<string>();
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

    for (const oldNo of cleanupCandidates) {
      const stillExists = await existsLactinaBySystemNo(oldNo);
      if (!stillExists) {
        await clearUnifiedDerivedBySystemNo(oldNo);
      }
    }

    return NextResponse.json({ ok: true, updatedCount: updatedIds.length, updatedIds });  
  } catch (e) {
    console.error("POST /api/devices/lactina/bulk-patch error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}