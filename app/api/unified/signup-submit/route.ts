import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * POST /api/unified/signup-submit
 * body: { data: Record<string,string> }
 *
 * - “마지막 데이터가 있는 행” 다음의 “첫 빈 행”에 data를 merge 저장
 * - 빈 행이 없으면 새 행을 만들어 저장
 * - 저장 후 프론트에서 syncEmitUnifiedUpdate() 호출로 실시간 반영
 */

function isPlainObject(v: any) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

const SUBMIT_EXTENSION_KEYS = [
  "1차연장",
  "2차연장",
  "3차연장",
  "4차연장",
  "5차연장",
  "6차연장",
  "7차연장",
  "8차연장",
  "9차연장",
  "10차연장",
  "11차연장",
  "12차연장",
  "13차연장",
  "14차연장",
  "15차연장",
] as const;

function getSubmitExtensionDaysFromCellText(raw: any): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;

  const first = s.split("/")[0]?.trim() ?? "";
  const n = Number(first);
  if (!Number.isFinite(n)) return 0;

  const i = Math.floor(n);
  return i > 0 ? i : 0;
}

function sumSubmitExtensionDaysFromRow(data: Record<string, any>): number {
  const zeroRaw = data?.["0차연장"];
  const zero = Number(String(zeroRaw ?? "").trim());
  let total = Number.isFinite(zero) && zero > 0 ? Math.floor(zero) : 0;

  for (const key of SUBMIT_EXTENSION_KEYS) {
    total += getSubmitExtensionDaysFromCellText(data?.[key]);
  }

  return Math.max(0, Math.floor(total));
}

function parseSubmitYMD(raw: any): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  if (/^1900[-./]01[-./]00(\b|$)/.test(s)) return null;

  if (/^\d{8}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    return safeSubmitDate(y, m, d);
  }

  const m1 = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m1) {
    const y = Number(m1[1]);
    const m = Number(m1[2]);
    const d = Number(m1[3]);
    return safeSubmitDate(y, m, d);
  }

  if (s.includes("T")) {
    return parseSubmitYMD(s.split("T")[0]);
  }

  return null;
}

function safeSubmitDate(y: number, m: number, d: number): Date | null {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toSubmitYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeSubmitEndDateFromStartAndDays(startDateRaw: any, totalDaysRaw: any): string | null {
  const start = parseSubmitYMD(startDateRaw);
  if (!start) return null;

  const days = Number(String(totalDaysRaw ?? "").trim());
  if (!Number.isFinite(days)) return null;

  const d = Math.floor(days);
  if (d <= 0) return null;

  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
  return toSubmitYMD(end);
}

function buildSubmitAutoEndDatePatch(data: Record<string, any>): Record<string, any> {
  const existingEndDate = normalizeString(data?.["종료일"]);

  // ✅ 엑셀/업로드에서 종료일까지 같이 들어온 경우는 그대로 유지
  if (existingEndDate) return {};

  const totalDays = sumSubmitExtensionDaysFromRow(data);
  const nextEndDate = computeSubmitEndDateFromStartAndDays(data?.["시작일"], totalDays);

  // ✅ 시작일만 있고 0차/연장일수가 없으면 종료일 자동 생성하지 않음
  if (!nextEndDate) return {};

  return { 종료일: nextEndDate };
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const dataRaw = body?.data;

  if (!isPlainObject(dataRaw)) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  // 값은 문자열로 통일(빈값 허용)
  const data: Record<string, any> = {};
  for (const [k, v] of Object.entries(dataRaw)) {
    const key = String(k).trim();
    if (!key) continue;
    data[key] = String(v ?? "");
  }

  // 1) 마지막 데이터 행 커서 찾기 (tailData에서 쓰던 방식과 유사: 뒤에서 일부만 스캔)
  const scanLimit = 20000;

  const cursorR = await query(
    `
    WITH candidates AS (
      SELECT u.id, u.data, o.sort_key
      FROM unified u
      JOIN unified_order o ON o.unified_id = u.id
      ORDER BY o.sort_key DESC, u.id DESC
      LIMIT $1
    ),
    last_data AS (
      SELECT c.sort_key, c.id
      FROM candidates c
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_each_text(c.data) kv
        WHERE kv.value IS NOT NULL AND kv.value <> ''
      )
      ORDER BY c.sort_key DESC, c.id DESC
      LIMIT 1
    ),
    last_any AS (
      SELECT c.sort_key, c.id
      FROM candidates c
      ORDER BY c.sort_key DESC, c.id DESC
      LIMIT 1
    )
    SELECT
      COALESCE((SELECT sort_key FROM last_data), (SELECT sort_key FROM last_any), 0) AS sort_key,
      COALESCE((SELECT id FROM last_data), (SELECT id FROM last_any), 0) AS id
    `,
    [scanLimit]
  );

  const cursorSortKey = Number(cursorR.rows[0]?.sort_key ?? 0);
  const cursorId = Number(cursorR.rows[0]?.id ?? 0);

  // 2) “커서 다음”의 첫 빈 행 찾기
  const emptyR = await query(
    `
    SELECT u.id
    FROM unified u
    JOIN unified_order o ON o.unified_id = u.id
    WHERE (o.sort_key, u.id) > ($1::numeric, $2::int)
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_each_text(u.data) kv
        WHERE kv.value IS NOT NULL AND kv.value <> ''
      )
    ORDER BY o.sort_key ASC, u.id ASC
    LIMIT 1
    `,
    [cursorSortKey, cursorId]
  );

  let targetId: number | null = emptyR.rows.length ? Number(emptyR.rows[0].id) : null;

  // 3) 빈 행이 없으면 새 행 생성 + unified_order 생성
  if (!targetId) {
    const ins = await query(`INSERT INTO unified (data) VALUES ('{}'::jsonb) RETURNING id`);
    targetId = Number(ins.rows[0]?.id ?? 0);

    const maxR = await query(`SELECT COALESCE(MAX(sort_key), 0) AS max FROM unified_order`);
    const max = Number(maxR.rows[0]?.max ?? 0);
    const nextKey = max + 1000;

    await query(
      `INSERT INTO unified_order (unified_id, sort_key) VALUES ($1, $2)
       ON CONFLICT (unified_id) DO NOTHING`,
      [targetId, nextKey]
    );
  }

  if (!targetId) {
    return NextResponse.json({ error: "NO_TARGET_ROW" }, { status: 500 });
  }

  // ✅ 종료일 자동 계산:
  // - 종료일이 같이 들어온 경우는 그대로 유지
  // - 종료일이 없고 시작일 + 0차/1~15차 연장일수가 있으면 자동 계산해서 저장
  // - 시작일만 있는 경우 종료일을 시작일과 동일하게 자동 생성하지 않음
  const autoEndDatePatch = buildSubmitAutoEndDatePatch(data);
  const patchData = { ...data, ...autoEndDatePatch };

  // 4) 대상 행에 merge 저장(JSONB)
  const upd = await query(
    `UPDATE unified SET data = data || $1::jsonb WHERE id = $2 RETURNING id`,
    [JSON.stringify(patchData), targetId]
  ); 

  return NextResponse.json({ ok: true, id: upd.rows[0]?.id ?? targetId });
}