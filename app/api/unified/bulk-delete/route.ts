// app/api/unified/bulk-delete/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  buildUnifiedDeleteChangeItems,
  getChangeHistoryActor,
  recordUnifiedChangeHistory,
} from "@/unified/change-history/serverChangeHistory";

/**
 * POST /api/unified/bulk-delete
 * body:
 * {
 *   ids: number[]
 * }
 *
 * - unified 삭제 + unified_order 정리를 "한 번의 SQL"로 원자적으로 처리
 * - unified_order를 먼저 삭제해서 FK가 있어도 안전하게 동작
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const idsRaw = body?.ids;
  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "ids array is required" },
      { status: 400 }
    );
  }

  const ids = idsRaw
    .map((x: any) => Number(x))
    .filter((n: number) => Number.isFinite(n) && n > 0)
    .map((n: number) => Math.floor(n));

  if (ids.length !== idsRaw.length) {
    return NextResponse.json(
      { error: "INVALID_IDS", message: "ids must be positive numbers" },
      { status: 400 }
    );
  }

   const sql = `
    WITH del_order AS (
      DELETE FROM unified_order
      WHERE unified_id = ANY($1::int[])
      RETURNING unified_id
    ),
    del_unified AS (
      DELETE FROM unified
      WHERE id = ANY($1::int[])
      RETURNING id, data
    )
    SELECT
      (SELECT COUNT(*)::int FROM del_unified) AS deleted_count,
      COALESCE((SELECT json_agg(id ORDER BY id) FROM del_unified), '[]'::json) AS deleted_ids,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', id,
              'data', data
            )
            ORDER BY id
          )
          FROM del_unified
        ),
        '[]'::json
      ) AS deleted_rows
  `;

  const r = await query(sql, [ids]);
  const row = r.rows?.[0] ?? {};

  const deletedCount = Number(row?.deleted_count ?? 0);

  let deletedIds: number[] = [];
  const raw = row?.deleted_ids;

  if (Array.isArray(raw)) {
    deletedIds = raw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n));
  } else if (typeof raw === "string") {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        deletedIds = arr.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n));
      }
    } catch {
      deletedIds = [];
    }
  }

  let deletedRows: Array<{ id: number; data: any }> = [];
  const rawRows = row?.deleted_rows;

  if (Array.isArray(rawRows)) {
    deletedRows = rawRows
      .map((x: any) => ({
        id: Number(x?.id),
        data: x?.data,
      }))
      .filter((x: any) => Number.isFinite(x.id) && x.id > 0);
  } else if (typeof rawRows === "string") {
    try {
      const arr = JSON.parse(rawRows);
      if (Array.isArray(arr)) {
        deletedRows = arr
          .map((x: any) => ({
            id: Number(x?.id),
            data: x?.data,
          }))
          .filter((x: any) => Number.isFinite(x.id) && x.id > 0);
      }
    } catch {
      deletedRows = [];
    }
  }

  // ✅ 변경이력 기록
  // - 삭제 전 row data를 before_row_data로 저장
  // - 이력 기록 실패가 삭제 성공 응답에 영향 주지 않도록 catch 처리
  try {
    const items = buildUnifiedDeleteChangeItems(deletedRows);

    if (items.length) {
      const actor = await getChangeHistoryActor();

      await recordUnifiedChangeHistory({
        action_type: "bulk_delete",
        changed_by_username: actor.username,
        changed_by_name: actor.name,
        description: `통합관리 대량 삭제 ${items.length}행`,
        items,
      });
    }
  } catch (err) {
    console.warn("unified bulk delete change history record failed (ignored):", err);
  }

  return NextResponse.json({
    ok: true,
    deletedCount,
    deletedIds,
  }); 
}