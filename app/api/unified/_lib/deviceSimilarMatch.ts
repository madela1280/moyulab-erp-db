// app/api/unified/_lib/deviceSimilarMatch.ts
//
// 기기번호가 기기관리 마스터에 정확히 없을 때, "한 자리만 다른" 비슷한 기기번호를 찾는다.
// - 통합관리 직접입력(bulk-patch)과 데이터업로드 신규가입(signup-transfer) 양쪽에서 공용으로 사용.
// - 후보가 정확히 1개일 때만 제안(여러 개면 애매하므로 표시하지 않음 = 오탐 방지).

import { query } from "@/lib/db";

const DEVICE_TABLES = [
  "device_symphony",
  "device_lactina",
  "device_swing",
  "device_swing_maxi",
  "device_simile",
  "device_gaksimil",
] as const;

export type SimilarDeviceMatch = {
  기기번호: string;
  기종: string;
};

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

function isHammingDistanceOne(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diff++;
      if (diff > 1) return false;
    }
  }
  return diff === 1;
}

export async function findSimilarDeviceNo(deviceNoRaw: string): Promise<SimilarDeviceMatch | null> {
  const needle = normalizeString(deviceNoRaw);
  if (!needle) return null;

  const candidates: { device: string; model: string }[] = [];

  for (const table of DEVICE_TABLES) {
    const existsR = await query(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
    if (!existsR.rows?.[0]?.reg) continue;

    const r = await query(
      `
      SELECT
        trim(COALESCE(data->>'시스템 기기번호','')) AS device,
        COALESCE(data->>'기종','') AS model
      FROM ${table}
      WHERE length(trim(COALESCE(data->>'시스템 기기번호',''))) = $1
      `,
      [needle.length]
    );

    for (const row of r.rows || []) {
      const d = normalizeString(row?.device);
      if (!d) continue;
      candidates.push({ device: d, model: normalizeString(row?.model) });
    }
  }

  const matches = candidates.filter((c) => isHammingDistanceOne(needle, c.device));
  if (matches.length !== 1) return null;

  return { 기기번호: matches[0].device, 기종: matches[0].model };
}
