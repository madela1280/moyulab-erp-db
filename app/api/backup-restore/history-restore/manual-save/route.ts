// app/api/backup-restore/history-restore/manual-save/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  getChangeHistoryActor,
  recordUnifiedChangeHistory,
  type UnifiedChangeItemInput,
} from "@/unified/change-history/serverChangeHistory";

/**
 * POST /api/backup-restore/history-restore/manual-save
 *
 * 역할:
 * - 변경이력복원 화면의 "현재 통합관리 수정 화면"에서 직접 수정한 값을 저장
 * - 저장 직전 현재값 재검사
 * - 다른 사용자 락 확인
 * - 충돌 항목은 저장 제외
 * - 성공한 수정/삭제/삽입은 변경이력으로 다시 기록
 *
 * 원칙:
 * - 전체 롤백 아님
 * - 사용자가 직접 수정한 값만 현재 unified에 반영
 * - sync/lock core 수정 없음
 * - locks 테이블은 서버 API 내부에서 안전장치로 읽기만 함
 */

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

function normalizeJsonValue(value: any) {
  return value === undefined ? null : value;
}

function isPlainObject(v: any): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function stringifyCellValue(value: any) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isSameJsonValue(a: any, b: any) {
  return JSON.stringify(normalizeJsonValue(a)) === JSON.stringify(normalizeJsonValue(b));
}

function getCellValue(rowData: any, columnKey: string | null) {
  if (!columnKey) return null;
  if (!isPlainObject(rowData)) return null;
  return normalizeJsonValue(rowData[columnKey]);
}

function normalizePositiveInt(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function normalizeUpdates(v: any) {
  if (!Array.isArray(v)) return [];

  return v
    .map((item: any) => ({
      unified_id: normalizePositiveInt(item?.unified_id),
      column_key: normalizeString(item?.column_key),
      before_value: item?.before_value,
      expected_current_value: item?.expected_current_value,
      next_value: item?.next_value,
    }))
    .filter((item: any) => item.unified_id && item.column_key);
}

function normalizeDeletes(v: any) {
  if (!Array.isArray(v)) return [];

  return v
    .map((item: any) => ({
      unified_id: normalizePositiveInt(item?.unified_id),
      expected_row_data: isPlainObject(item?.expected_row_data)
        ? item.expected_row_data
        : {},
    }))
    .filter((item: any) => item.unified_id);
}

function normalizeInserts(v: any) {
  if (!Array.isArray(v)) return [];

  return v
    .map((item: any) => ({
      after_row_key: item?.after_row_key === null ? null : normalizeString(item?.after_row_key),
      data: isPlainObject(item?.data) ? item.data : {},
    }))
    .filter((item: any) => Object.keys(item.data || {}).length > 0);
}

function parseUnifiedIdFromRowKey(rowKey: string | null) {
  const text = normalizeString(rowKey);
  if (!text.startsWith("u:")) return null;

  return normalizePositiveInt(text.slice(2));
}

type ManualSaveSkipped = {
  type: "update" | "delete" | "insert";
  unified_id: number | null;
  column_key?: string | null;
  reason: string;
  message: string;
};

async function getLockedByOtherSet(unifiedIds: number[], username: string) {
  const lockedByOtherSet = new Set<number>();

  if (!unifiedIds.length) return lockedByOtherSet;

  const lockResult = await query(
    `
    SELECT resource_id
    FROM locks
    WHERE resource_type = 'unified'
      AND resource_id = ANY($1::int[])
      AND expires_at > NOW()
      AND COALESCE(locked_by_username, '') <> $2
    `,
    [unifiedIds, username]
  );

  for (const row of lockResult.rows || []) {
    const id = Number(row?.resource_id);
    if (Number.isFinite(id) && id > 0) {
      lockedByOtherSet.add(Math.floor(id));
    }
  }

  return lockedByOtherSet;
}

async function loadCurrentRows(unifiedIds: number[]) {
  const map = new Map<number, Record<string, any>>();

  if (!unifiedIds.length) return map;

  const result = await query(
    `
    SELECT id, data
    FROM unified
    WHERE id = ANY($1::int[])
    `,
    [unifiedIds]
  );

  for (const row of result.rows || []) {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id <= 0) continue;

    map.set(Math.floor(id), isPlainObject(row?.data) ? row.data : {});
  }

  return map;
}

async function getInsertSortKey(afterUnifiedId: number | null) {
  if (afterUnifiedId) {
    const result = await query(
      `
      WITH target AS (
        SELECT sort_key
        FROM unified_order
        WHERE unified_id = $1
        LIMIT 1
      ),
      next_row AS (
        SELECT MIN(sort_key) AS next_sort_key
        FROM unified_order
        WHERE sort_key > (SELECT sort_key FROM target)
      )
      SELECT
        (SELECT sort_key FROM target) AS target_sort_key,
        (SELECT next_sort_key FROM next_row) AS next_sort_key,
        (SELECT COALESCE(MAX(sort_key), 0) FROM unified_order) AS max_sort_key
      `,
      [afterUnifiedId]
    );

    const row = result.rows?.[0];
    const targetSortKey = Number(row?.target_sort_key);
    const nextSortKey = Number(row?.next_sort_key);
    const maxSortKey = Number(row?.max_sort_key);

    if (Number.isFinite(targetSortKey)) {
      if (Number.isFinite(nextSortKey) && nextSortKey > targetSortKey) {
        return (targetSortKey + nextSortKey) / 2;
      }

      return targetSortKey + 1000;
    }

    return (Number.isFinite(maxSortKey) ? maxSortKey : 0) + 1000;
  }

  const result = await query(
    `
    SELECT COALESCE(MAX(sort_key), 0) + 1000 AS next_sort_key
    FROM unified_order
    `
  );

  return Number(result.rows?.[0]?.next_sort_key ?? 1000);
}

export async function POST(req: Request) {
  const user = await getSessionUser();

  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  const sourceOperationId = normalizeString(body?.operationId);
  const updates = normalizeUpdates(body?.updates);
  const deletes = normalizeDeletes(body?.deletes);
  const inserts = normalizeInserts(body?.inserts);

  if (!sourceOperationId) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "operationId is required" },
      { status: 400 }
    );
  }

  if (!updates.length && !deletes.length && !inserts.length) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "저장할 변경사항이 없습니다." },
      { status: 400 }
    );
  }

  const opResult = await query(
    `
    SELECT operation_id
    FROM unified_change_operations
    WHERE operation_id = $1
      AND domain = 'unified'
      AND changed_by_username = $2
      AND created_at >= NOW() - INTERVAL '7 days'
    LIMIT 1
    `,
    [sourceOperationId, user.username]
  );

  if (!opResult.rows.length) {
    return NextResponse.json(
      {
        error: "NOT_FOUND",
        message: "본인 변경이력이 아니거나 복구 가능 기간이 지났습니다.",
      },
      { status: 404 }
    );
  }

  const targetUnifiedIds = Array.from(
    new Set(
      [...updates.map((x: any) => x.unified_id), ...deletes.map((x: any) => x.unified_id)]
        .filter((id: any) => Number.isFinite(Number(id)) && Number(id) > 0)
        .map((id: any) => Math.floor(Number(id)))
    )
  );

  const lockedByOtherSet = await getLockedByOtherSet(targetUnifiedIds, user.username);
  const currentRowMap = await loadCurrentRows(targetUnifiedIds);

  const skipped: ManualSaveSkipped[] = [];
  const historyItems: UnifiedChangeItemInput[] = [];

  let updatedCount = 0;
  let deletedCount = 0;
  let insertedCount = 0;

  for (const item of updates) {
    const unifiedId = Number(item.unified_id);
    const columnKey = normalizeString(item.column_key);

    if (!Number.isFinite(unifiedId) || unifiedId <= 0 || !columnKey) {
      skipped.push({
        type: "update",
        unified_id: Number.isFinite(unifiedId) ? unifiedId : null,
        column_key: columnKey || null,
        reason: "invalid_update",
        message: "유효하지 않은 셀 수정 요청입니다.",
      });
      continue;
    }

    if (lockedByOtherSet.has(unifiedId)) {
      skipped.push({
        type: "update",
        unified_id: unifiedId,
        column_key: columnKey,
        reason: "locked_by_other",
        message: "다른 사용자가 현재 행을 편집 중입니다.",
      });
      continue;
    }

    const currentRowData = currentRowMap.get(unifiedId) ?? null;

    if (!isPlainObject(currentRowData)) {
      skipped.push({
        type: "update",
        unified_id: unifiedId,
        column_key: columnKey,
        reason: "deleted",
        message: "현재 행이 없어 수정할 수 없습니다.",
      });
      continue;
    }

    const currentValue = getCellValue(currentRowData, columnKey);
    const currentText = stringifyCellValue(currentValue);
    const expectedText = stringifyCellValue(item.expected_current_value);

    if (currentText !== expectedText) {
      skipped.push({
        type: "update",
        unified_id: unifiedId,
        column_key: columnKey,
        reason: "conflict",
        message: "현재값이 화면을 열었을 때와 달라 충돌로 제외했습니다.",
      });
      continue;
    }

    const nextValue = stringifyCellValue(item.next_value);

    if (currentText === nextValue) {
      skipped.push({
        type: "update",
        unified_id: unifiedId,
        column_key: columnKey,
        reason: "no_change",
        message: "현재값과 수정값이 같아 저장하지 않았습니다.",
      });
      continue;
    }

    const patch = {
      [columnKey]: nextValue,
    };

    const updateResult = await query(
      `
      UPDATE unified
      SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb
      WHERE id = $2
      RETURNING id, data
      `,
      [JSON.stringify(patch), unifiedId]
    );

    const saved = updateResult.rows?.[0];

    if (!saved) {
      skipped.push({
        type: "update",
        unified_id: unifiedId,
        column_key: columnKey,
        reason: "update_failed",
        message: "셀 수정 저장에 실패했습니다.",
      });
      continue;
    }

    const afterRowData = isPlainObject(saved?.data) ? saved.data : {};

    historyItems.push({
      unified_id: unifiedId,
      column_key: columnKey,
      before_value: normalizeJsonValue(currentValue),
      after_value: normalizeJsonValue(nextValue),
      before_row_data: currentRowData,
      after_row_data: afterRowData,
      action_type: "bulk_patch",
    });

    currentRowMap.set(unifiedId, afterRowData);
    updatedCount++;
  }

  for (const item of deletes) {
    const unifiedId = Number(item.unified_id);

    if (!Number.isFinite(unifiedId) || unifiedId <= 0) {
      skipped.push({
        type: "delete",
        unified_id: null,
        reason: "invalid_delete",
        message: "유효하지 않은 행 삭제 요청입니다.",
      });
      continue;
    }

    if (lockedByOtherSet.has(unifiedId)) {
      skipped.push({
        type: "delete",
        unified_id: unifiedId,
        reason: "locked_by_other",
        message: "다른 사용자가 현재 행을 편집 중입니다.",
      });
      continue;
    }

    const currentRowData = currentRowMap.get(unifiedId) ?? null;

    if (!isPlainObject(currentRowData)) {
      skipped.push({
        type: "delete",
        unified_id: unifiedId,
        reason: "already_deleted",
        message: "이미 삭제된 행입니다.",
      });
      continue;
    }

    if (!isSameJsonValue(currentRowData, item.expected_row_data)) {
      skipped.push({
        type: "delete",
        unified_id: unifiedId,
        reason: "conflict",
        message: "현재 행 값이 화면을 열었을 때와 달라 삭제하지 않았습니다.",
      });
      continue;
    }

    const deleteResult = await query(
      `
      WITH del_order AS (
        DELETE FROM unified_order
        WHERE unified_id = $1
        RETURNING unified_id
      ),
      del_unified AS (
        DELETE FROM unified
        WHERE id = $1
        RETURNING id, data
      )
      SELECT id, data
      FROM del_unified
      `,
      [unifiedId]
    );

    const deleted = deleteResult.rows?.[0];

    if (!deleted) {
      skipped.push({
        type: "delete",
        unified_id: unifiedId,
        reason: "delete_failed",
        message: "행 삭제에 실패했습니다.",
      });
      continue;
    }

    historyItems.push({
      unified_id: unifiedId,
      column_key: null,
      before_value: null,
      after_value: null,
      before_row_data: currentRowData,
      after_row_data: null,
      action_type: "bulk_delete",
    });

    currentRowMap.delete(unifiedId);
    deletedCount++;
  }

  for (const item of inserts) {
    const afterUnifiedId = parseUnifiedIdFromRowKey(item.after_row_key);
    const sortKey = await getInsertSortKey(afterUnifiedId);

    const insertResult = await query(
      `
      WITH ins AS (
        INSERT INTO unified (data)
        VALUES ($1::jsonb)
        RETURNING id, data
      ),
      ins_order AS (
        INSERT INTO unified_order (unified_id, sort_key)
        SELECT id, $2
        FROM ins
        RETURNING unified_id
      )
      SELECT id, data
      FROM ins
      `,
      [JSON.stringify(item.data), sortKey]
    );

    const inserted = insertResult.rows?.[0];

    if (!inserted) {
      skipped.push({
        type: "insert",
        unified_id: null,
        reason: "insert_failed",
        message: "행 추가에 실패했습니다.",
      });
      continue;
    }

    const insertedId = Number(inserted?.id);
    const insertedData = isPlainObject(inserted?.data) ? inserted.data : item.data;

    historyItems.push({
      unified_id: Number.isFinite(insertedId) ? insertedId : null,
      column_key: null,
      before_value: null,
      after_value: null,
      before_row_data: null,
      after_row_data: insertedData,
      action_type: "insert",
    });

    insertedCount++;
  }

  let historyOperationId: string | null = null;

  if (historyItems.length) {
    const actor = await getChangeHistoryActor();

    const historyResult = await recordUnifiedChangeHistory({
      action_type: "bulk_patch",
      changed_by_username: actor.username,
      changed_by_name: actor.name,
      description: `변경이력복원 현재화면 직접수정 ${historyItems.length}건`,
      restored_from_operation_id: sourceOperationId,
      restore_reason: "변경이력복원 현재화면 직접수정",
      items: historyItems,
    });

    historyOperationId = historyResult?.operation_id ?? null;
  }

  return NextResponse.json({
    ok: true,

    requestedUpdateCount: updates.length,
    requestedDeleteCount: deletes.length,
    requestedInsertCount: inserts.length,

    updatedCount,
    deletedCount,
    insertedCount,
    skippedCount: skipped.length,

    skipped,
    operationId: historyOperationId,
  });
}