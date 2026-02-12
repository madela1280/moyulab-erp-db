// app/api/unified/bulk-patch/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * POST /api/unified/bulk-patch
 * body:
 * {
 *   updates: Array<{ id: number, patch?: Record<string, any>, data?: Record<string, any> }>
 * }
 *
 * - patch/data는 "merge"로 반영됨 (기존 PATCH와 동일하게 null도 그대로 저장)
 * - 한 번의 UPDATE 쿼리로 처리
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

// 기기관리 6개 테이블(소카테고리)
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

      // 이미 다른 테이블에서 먼저 찾은 값이 있으면 유지(우선순위: 테이블 배열 순서)
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

// ✅ 거래처분류 → 안내분류 매핑 맵(대량 적용용)
async function buildPartnerGuideMap(partners: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const cleaned = Array.from(new Set((partners || []).map(normalizeString).filter(Boolean)));
  if (!cleaned.length) return map;

  const r = await query(
    `
    SELECT partner_name, guide_name
    FROM partner_guide_map
    WHERE partner_name = ANY($1::text[])
    `,
    [cleaned]
  );

  for (const row of r.rows || []) {
    const p = normalizeString(row?.partner_name);
    if (!p) continue;
    const g = normalizeString(row?.guide_name);
    map.set(p, g ? g : null);
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

  // 정규화 (patch / data 둘 다 허용)
  const updates = updatesRaw.map((u: any) => {
    const id = Number(u?.id);
    const patchRaw = u?.patch ?? u?.data;

    // ✅ "상태"는 파생 표시 컬럼이므로 bulk 저장 대상에서 제외(무시)
    const patch = isPlainObject(patchRaw)
      ? (() => {
          const copy: Record<string, any> = { ...(patchRaw as any) };
          delete copy["상태"];
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
  // ✅ 기기번호가 bulk로 들어오는 경우(붙여넣기/대량수정) 자동 매칭
  // - patch 안에 "기기번호" 키가 포함된 update만 대상
  // - 기기번호가 비면(빈문자열/null) 파생값도 null로 정리
  // - 매칭 성공 시: 기종/구매/렌탈/에러횟수/제품(=제품명) merge
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

    // 기기번호를 지우는 경우: 파생값도 null로
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
      // 매칭 실패 시: 잔상 방지(빈값 표시)
      p["기종"] = null;
      p["구매/렌탈"] = null;
      p["에러횟수"] = null;
      p["제품"] = null;
    }
  }

  // ---------------------------------------------------------------------------
  // ✅ 거래처분류가 bulk로 들어오는 경우 자동 매칭(거래처 → 안내분류)
  // - patch 안에 "거래처분류" 키가 포함된 update만 대상
  // - 매핑이 없거나 거래처분류가 비면 안내분류는 null
  // - 거래처분류가 포함된 경우 안내분류는 항상 매핑 기준으로 overwrite
  // ---------------------------------------------------------------------------
  const partnerNamesSet = new Set<string>();
  const partnerTargetIndexes: number[] = [];

  for (let i = 0; i < updates.length; i++) {
    const p = updates[i]?.patch;
    if (!isPlainObject(p)) continue;
    if (!Object.prototype.hasOwnProperty.call(p, "거래처분류")) continue;

    partnerTargetIndexes.push(i);

    const raw = (p as any)["거래처분류"];
    const partner = normalizeString(raw);
    if (partner) partnerNamesSet.add(partner);
  }

  const partnerGuideMap = await buildPartnerGuideMap(Array.from(partnerNamesSet));

  for (const idx of partnerTargetIndexes) {
    const u = updates[idx];
    const p = u.patch as Record<string, any>;

    const rawPartner = p["거래처분류"];
    const partner = normalizeString(rawPartner);

    if (!partner) {
      p["안내분류"] = null;
      continue;
    }

    const guide = partnerGuideMap.get(partner) ?? null;
    p["안내분류"] = guide;
  }

  // ✅ jsonb merge(원자적):
  // - u.data가 NULL인 행에서도 merge가 정상 동작하도록 COALESCE 적용(중요)
  // - patch에 null이 들어오면 해당 key를 null로 저장 (기존 PATCH와 동일)
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