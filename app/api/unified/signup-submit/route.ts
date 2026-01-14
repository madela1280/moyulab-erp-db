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

  // 4) 대상 행에 merge 저장(JSONB)
  const upd = await query(
    `UPDATE unified SET data = data || $1::jsonb WHERE id = $2 RETURNING id`,
    [JSON.stringify(data), targetId]
  );

  return NextResponse.json({ ok: true, id: upd.rows[0]?.id ?? targetId });
}