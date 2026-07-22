// app/api/unified/migration-bulk-patch/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { UNIFIED_GUIDE_MIGRATION_LOCK_KEY } from "@/unified/migration-mode/guideMigrationLock";

/**
 * POST /api/unified/migration-bulk-patch
 *
 * 초기이관 ON 전용 bulk 저장 API
 *
 * 목적:
 * - 엑셀에서 붙여넣은 "안내분류" 값을 그대로 저장한다.
 * - 해당 행에 안내분류 고정 플래그(__guideMigrationLocked=true)를 저장한다.
 * - 거래처분류 → 안내분류 자동매핑은 이 API에서 절대 실행하지 않는다.
 * - 단, 기기번호 → 기종/구매렌탈/에러횟수/제품 자동매핑은 기존처럼 유지한다.
 *
 * body:
 * {
 *   updates: Array<{ id: number, patch?: Record<string, any>, data?: Record<string, any> }>
 * }
 */

function isPlainObject(v: any) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

function normalizeLower(v: any) {
  return normalizeString(v).toLowerCase();
}

// 기기관리 6개 테이블
const DEVICE_TABLES = [
  "device_symphony",
  "device_lactina",
  "device_swing",
  "device_swing_maxi",
  "device_simile",
  "device_gaksimil",
] as const;

async function tableExists(tableName: string): Promise<boolean> {
  const r = await query(`SELECT to_regclass($1) AS reg`, [`public.${tableName}`]);
  return !!r.rows?.[0]?.reg;
}

type DeviceInfo = {
  제품명: string | null;
  기종: string | null;
  구매렌탈: string | null;
  에러횟수: string | null;
};

async function buildDeviceInfoMap(devicesLower: string[]): Promise<Map<string, DeviceInfo>> {
  const map = new Map<string, DeviceInfo>();
  if (!devicesLower.length) return map;

  for (const table of DEVICE_TABLES) {
    const exists = await tableExists(table);
    if (!exists) continue;

    const sql = `
      SELECT
        lower(COALESCE(data->>'시스템 기기번호','')) AS device,
        COALESCE(data->>'제품명','') AS product_name,
        COALESCE(data->>'기종','') AS model,
        COALESCE(data->>'구매/렌탈','') AS buy_rent,
        COALESCE(data->>'에러횟수','') AS error_count
      FROM ${table}
      WHERE lower(COALESCE(data->>'시스템 기기번호','')) = ANY($1::text[])
    `;

    const r = await query(sql, [devicesLower]);

    for (const row of r.rows || []) {
      const d = normalizeLower(row?.device);
      if (!d) continue;

      // 우선순위는 DEVICE_TABLES 배열 순서
      if (map.has(d)) continue;

      const 제품명 = normalizeString(row?.product_name);
      const 기종 = normalizeString(row?.model);
      const 구매렌탈 = normalizeString(row?.buy_rent);
      const 에러횟수 = normalizeString(row?.error_count);

      map.set(d, {
        제품명: 제품명 ? 제품명 : null,
        기종: 기종 ? 기종 : null,
        구매렌탈: 구매렌탈 ? 구매렌탈 : null,
        에러횟수: 에러횟수 ? 에러횟수 : null,
      });
    }
  }

  return map;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const updatesRaw = body?.updates;
  if (!Array.isArray(updatesRaw) || updatesRaw.length === 0) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "updates array is required" },
      { status: 400 }
    );
  }

  const updates = updatesRaw.map((u: any) => {
    const id = Number(u?.id);
    const patchRaw = u?.patch ?? u?.data;

    const patch = isPlainObject(patchRaw)
      ? (() => {
          const copy: Record<string, any> = { ...(patchRaw as any) };

          // 상태는 파생 표시 컬럼이므로 저장하지 않음
          delete copy["상태"];

          // ✅ 초기이관 전용: 안내분류 고정 플래그를 무조건 저장
          copy[UNIFIED_GUIDE_MIGRATION_LOCK_KEY] = true;

          return copy;
        })()
      : patchRaw;

    return { id, patch };
  });

  for (const u of updates) {
    if (!Number.isFinite(u.id) || u.id <= 0) {
      return NextResponse.json(
        { error: "INVALID_ID", message: "Invalid id in updates" },
        { status: 400 }
      );
    }

    if (!u.patch || typeof u.patch !== "object" || Array.isArray(u.patch)) {
      return NextResponse.json(
        { error: "INVALID_PATCH", message: "patch/data object is required" },
        { status: 400 }
      );
    }
  }

  // ---------------------------------------------------------------------------
  // ✅ 기기번호 자동매핑은 기존 bulk-patch와 동일하게 유지
  // - 초기이관이어도 기기번호가 들어오면 기종/구매렌탈/에러횟수/제품은 자동 반영
  // - 안내분류만 거래처분류 자동매핑에서 제외
  // ---------------------------------------------------------------------------
  const deviceNosLowerSet = new Set<string>();
  const deviceTargetIndexes: number[] = [];

  for (let i = 0; i < updates.length; i++) {
    const p = updates[i]?.patch;
    if (!isPlainObject(p)) continue;
    if (!Object.prototype.hasOwnProperty.call(p, "기기번호")) continue;

    deviceTargetIndexes.push(i);

    const raw = (p as any)["기기번호"];
    const dLower = normalizeLower(raw);
    if (dLower) deviceNosLowerSet.add(dLower);
  }

  const deviceMap = await buildDeviceInfoMap(Array.from(deviceNosLowerSet));

  for (const idx of deviceTargetIndexes) {
    const u = updates[idx];
    const p = u.patch as Record<string, any>;

    const rawDevice = p["기기번호"];
    const deviceNo = normalizeString(rawDevice);
    const deviceLower = normalizeLower(rawDevice);

    if (!deviceNo) {
      p["기종"] = null;
      p["구매/렌탈"] = null;
      p["에러횟수"] = null;
      p["제품"] = null;
      continue;
    }

    const info = deviceMap.get(deviceLower);

    if (info) {
      p["기종"] = info.기종;
      p["구매/렌탈"] = info.구매렌탈;
      p["에러횟수"] = info.에러횟수;
      p["제품"] = info.제품명;
    } else {
      p["기종"] = null;
      p["구매/렌탈"] = null;
      p["에러횟수"] = null;
      p["제품"] = null;
    }
  }

  // ---------------------------------------------------------------------------
  // ✅ 중요:
  // 이 초기이관 전용 API에서는 거래처분류 → 안내분류 자동매핑을 절대 실행하지 않는다.
  // 따라서 patch 안에 들어온 안내분류 값은 엑셀 원시값 그대로 저장된다.
  // ---------------------------------------------------------------------------

  const sql = `
    WITH v AS (
      SELECT
        (x->>'id')::int AS id,
        x->'patch' AS patch
      FROM jsonb_array_elements($1::jsonb) AS x
    )
    UPDATE unified u
    SET data = COALESCE(u.data, '{}'::jsonb) || COALESCE(v.patch, '{}'::jsonb)
    FROM v
    WHERE u.id = v.id
    RETURNING u.id, u.data
  `;

  const r = await query(sql, [JSON.stringify(updates)]);

  return NextResponse.json({
    ok: true,
    updatedCount: r.rows.length,
    rows: r.rows,
  });
}