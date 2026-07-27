import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  buildUnifiedInsertChangeItems,
  getChangeHistoryActor,
  recordUnifiedChangeHistory,
} from "@/unified/change-history/serverChangeHistory";

/**
 * POST /api/unified/insert
 * body: { count: number, beforeId?: number|null, afterId?: number|null }
 *
 * - beforeId: 삽입 위치 바로 "위" 행 id (없으면 null)
 * - afterId : 삽입 위치 바로 "아래" 행 id (없으면 null)
 *
 * 동작:
 * 1) unified에 빈 행 count개 생성
 * 2) unified_order에 sort_key를 (beforeKey, afterKey) 사이 값으로 부여하여 "중간 삽입" 구현
 * 3) gap이 너무 좁으면 unified_order 전체를 한 번 재정렬(간격=1000) 후 다시 삽입
 */
export async function POST(req: Request) {
  const body = await req.json();

  const count = Math.floor(Number(body?.count ?? 0));
  const beforeId =
    body?.beforeId === null || body?.beforeId === undefined
      ? null
      : Number(body.beforeId);
  const afterId =
    body?.afterId === null || body?.afterId === undefined
      ? null
      : Number(body.afterId);

  if (!Number.isFinite(count) || count <= 0 || count > 5000) {
    return NextResponse.json(
      { error: "INVALID_COUNT", message: "count must be 1..5000" },
      { status: 400 }
    );
  }
  if (beforeId !== null && (!Number.isFinite(beforeId) || beforeId <= 0)) {
    return NextResponse.json({ error: "INVALID_BEFORE_ID" }, { status: 400 });
  }
  if (afterId !== null && (!Number.isFinite(afterId) || afterId <= 0)) {
    return NextResponse.json({ error: "INVALID_AFTER_ID" }, { status: 400 });
  }

  // 존재 여부 체크(잘못된 id로 sort_key null 되는 케이스 방지)
  if (beforeId !== null) {
    const r = await query(
      `SELECT 1 FROM unified_order WHERE unified_id=$1 LIMIT 1`,
      [beforeId]
    );
    if (!r.rows.length) {
      return NextResponse.json({ error: "BEFORE_NOT_FOUND" }, { status: 404 });
    }
  }
  if (afterId !== null) {
    const r = await query(
      `SELECT 1 FROM unified_order WHERE unified_id=$1 LIMIT 1`,
      [afterId]
    );
    if (!r.rows.length) {
      return NextResponse.json({ error: "AFTER_NOT_FOUND" }, { status: 404 });
    }
  }

  const sql = `
    WITH
      params AS (
        SELECT
          $1::int AS cnt,
          $2::int AS before_id,
          $3::int AS after_id
      ),
      keys0 AS (
        SELECT
          (SELECT sort_key FROM unified_order WHERE unified_id = (SELECT before_id FROM params)) AS before_key,
          (SELECT sort_key FROM unified_order WHERE unified_id = (SELECT after_id FROM params)) AS after_key
      ),
      need_rebalance AS (
        SELECT
          (SELECT cnt FROM params) AS cnt,
          (SELECT before_id FROM params) AS before_id,
          (SELECT after_id FROM params) AS after_id,
          COALESCE((SELECT after_key FROM keys0), 0) - COALESCE((SELECT before_key FROM keys0), 0) AS gap
      ),
      rebalance AS (
        UPDATE unified_order o
        SET sort_key = r.rn * 1000
        FROM (
          SELECT unified_id, ROW_NUMBER() OVER (ORDER BY sort_key ASC, unified_id ASC) AS rn
          FROM unified_order
        ) r,
        need_rebalance n
        WHERE o.unified_id = r.unified_id
          AND n.before_id IS NOT NULL
          AND n.after_id IS NOT NULL
          AND n.gap <= (n.cnt + 1)
        RETURNING 1
      ),
      keys AS (
        SELECT
          (SELECT sort_key FROM unified_order WHERE unified_id = (SELECT before_id FROM params)) AS before_key,
          (SELECT sort_key FROM unified_order WHERE unified_id = (SELECT after_id FROM params)) AS after_key,
          (SELECT COALESCE(MAX(sort_key), 0) FROM unified_order) AS max_key
      ),
      ins AS (
        INSERT INTO unified (data)
        SELECT '{}'::jsonb
        FROM generate_series(1, (SELECT cnt FROM params))
        RETURNING id
      ),
      numbered AS (
        SELECT
          id,
          ROW_NUMBER() OVER (ORDER BY id ASC) AS rn,
          (SELECT cnt FROM params) AS cnt
        FROM ins
      ),
      calc AS (
        SELECT
          n.id,
          CASE
            -- 맨 뒤 삽입(append)
            WHEN (SELECT after_id FROM params) IS NULL THEN
              (SELECT max_key FROM keys) + (n.rn * 1000)

            -- 맨 앞 삽입(prepend)
            WHEN (SELECT before_id FROM params) IS NULL THEN
              (SELECT (SELECT sort_key FROM unified_order WHERE unified_id = (SELECT after_id FROM params))) - (((n.cnt - n.rn + 1)::numeric) * 1000)

            -- 중간 삽입
            ELSE
              (SELECT before_key FROM keys)
              + (
                  ((SELECT after_key FROM keys) - (SELECT before_key FROM keys))
                  * (n.rn::numeric)
                  / (n.cnt::numeric + 1)
                )
          END AS sort_key
        FROM numbered n
      ),
      ins_order AS (
        INSERT INTO unified_order (unified_id, sort_key)
        SELECT id, sort_key FROM calc
        RETURNING unified_id, sort_key
      )
    SELECT
      (SELECT COUNT(*) FROM ins) AS inserted_count,
      (SELECT json_agg(unified_id ORDER BY sort_key ASC) FROM ins_order) AS inserted_ids,
      (SELECT json_agg(json_build_object('id', unified_id, 'sort_key', sort_key) ORDER BY sort_key ASC) FROM ins_order) AS inserted_rows
  `;

    const r = await query(sql, [count, beforeId, afterId]);
  const row = r.rows[0] ?? {};

  const insertedCount = Number(row.inserted_count ?? 0);
  const insertedIds = row.inserted_ids ?? [];
  const insertedRows = row.inserted_rows ?? [];

  // ✅ 변경이력 기록
  // - 삽입된 row id/data를 after_row_data로 저장
  // - 현재 insert는 빈 data('{}') 생성이므로 data가 없으면 {}로 기록
  // - 이력 기록 실패가 행 삽입 성공 응답에 영향 주지 않도록 catch 처리
  try {
    const rowsForHistory = Array.isArray(insertedRows)
      ? insertedRows.map((x: any) => ({
          id: Number(x?.id),
          data: x?.data ?? {},
        }))
      : [];

    const items = buildUnifiedInsertChangeItems(rowsForHistory);

    if (items.length) {
      const actor = await getChangeHistoryActor();

      await recordUnifiedChangeHistory({
        action_type: "insert",
        changed_by_username: actor.username,
        changed_by_name: actor.name,
        description: `통합관리 행 삽입 ${items.length}행`,
        items,
      });
    }
  } catch (err) {
    console.warn("unified insert change history record failed (ignored):", err);
  }

  return NextResponse.json({
    ok: true,
    insertedCount,
    insertedIds,
    insertedRows,
  });
}