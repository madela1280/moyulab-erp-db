// app/api/backup-restore/history-restore/restore/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  getChangeHistoryActor,
  recordUnifiedChangeHistory,
  type UnifiedChangeItemInput,
} from "@/unified/change-history/serverChangeHistory";

/**
 * POST /api/backup-restore/history-restore/restore
 *
 * body:
 * {
 *   itemIds: number[],
 *   restoreReason?: string
 * }
 *
 * 역할:
 * - 선택한 change item만 현재 unified에 복원
 * - 복원 전 현재값을 다시 검사
 * - 충돌/락 항목은 복원 제외
 * - 복원 성공 항목은 restore 이력으로 다시 기록
 *
 * 원칙:
 * - 전체 롤백 금지
 * - 로그인한 사용자 본인 작업 이력만 복원 가능
 * - 현재값이 이력의 after_value와 같을 때만 셀 복원
 * - 삭제 복원은 현재 row가 없을 때만 가능
 * - 삽입 되돌리기는 삽입 후 row가 변경되지 않았을 때만 삭제 가능
 */

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

function normalizeJsonValue(value: any) {
  return value === undefined ? null : value;
}

function isSameJsonValue(a: any, b: any) {
  return JSON.stringify(normalizeJsonValue(a)) === JSON.stringify(normalizeJsonValue(b));
}

function isPlainObject(v: any) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function getCellValue(rowData: any, columnKey: string | null) {
  if (!columnKey) return null;
  if (!isPlainObject(rowData)) return null;
  return normalizeJsonValue(rowData[columnKey]);
}

function normalizeItemIds(v: any): number[] {
  if (!Array.isArray(v)) return [];

  return Array.from(
    new Set(
      v
        .map((x: any) => Number(x))
        .filter((n: number) => Number.isFinite(n) && n > 0)
        .map((n: number) => Math.floor(n))
    )
  );
}

type RestoreSkip = {
  item_id: number | null;
  unified_id: number | null;
  reason: string;
  message: string;
};

type LoadedItem = {
  id: number;
  operation_id: string;
  unified_id: number | null;
  column_key: string | null;
  before_value: any;
  after_value: any;
  before_row_data: any;
  after_row_data: any;
  action_type: string;
};

export async function POST(req: Request) {
  const user = await getSessionUser();

  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const itemIds = normalizeItemIds(body?.itemIds);
  const restoreReason = normalizeString(body?.restoreReason);

  if (!itemIds.length) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: "itemIds array is required" },
      { status: 400 }
    );
  }

  const itemsResult = await query(
    `
    SELECT
      i.id,
      i.operation_id,
      i.unified_id,
      i.column_key,
      i.before_value,
      i.after_value,
      i.before_row_data,
      i.after_row_data,
      i.action_type
    FROM unified_change_items i
    JOIN unified_change_operations o
      ON o.operation_id = i.operation_id
    WHERE i.id = ANY($1::bigint[])
      AND o.domain = 'unified'
      AND o.changed_by_username = $2
      AND o.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY i.id ASC
    `,
    [itemIds, user.username]
  );

  const loadedItems: LoadedItem[] = (itemsResult.rows || []).map((row: any) => ({
    id: Number(row?.id),
    operation_id: String(row?.operation_id ?? ""),
    unified_id:
      row?.unified_id === null || row?.unified_id === undefined
        ? null
        : Number(row.unified_id),
    column_key: row?.column_key === null ? null : normalizeString(row?.column_key),
    before_value: row?.before_value,
    after_value: row?.after_value,
    before_row_data: row?.before_row_data,
    after_row_data: row?.after_row_data,
    action_type: normalizeString(row?.action_type),
  }));

  if (!loadedItems.length) {
    return NextResponse.json(
      {
        error: "NOT_FOUND",
        message: "복원 가능한 본인 이력을 찾지 못했습니다.",
      },
      { status: 404 }
    );
  }

  const foundIdSet = new Set(loadedItems.map((item) => item.id));
  const skipped: RestoreSkip[] = itemIds
    .filter((id) => !foundIdSet.has(id))
    .map((id) => ({
      item_id: id,
      unified_id: null,
      reason: "not_found",
      message: "이력을 찾을 수 없거나 복원 가능 기간이 지났습니다.",
    }));

  const unifiedIds = Array.from(
    new Set(
      loadedItems
        .map((item) => Number(item.unified_id))
        .filter((id: number) => Number.isFinite(id) && id > 0)
        .map((id: number) => Math.floor(id))
    )
  );

  // ✅ 락 상태 확인
  // - 다른 사용자가 현재 row 락 중이면 복원 제외
  // - locks 코어/API는 수정하지 않고, DB 상태만 읽어서 안전장치로 사용
  const lockedByOtherSet = new Set<number>();

  if (unifiedIds.length) {
    const lockResult = await query(
      `
      SELECT resource_id
      FROM locks
      WHERE resource_type = 'unified'
        AND resource_id = ANY($1::int[])
        AND expires_at > NOW()
        AND COALESCE(locked_by_username, '') <> $2
      `,
      [unifiedIds, user.username]
    );

    for (const row of lockResult.rows || []) {
      const id = Number(row?.resource_id);
      if (Number.isFinite(id) && id > 0) {
        lockedByOtherSet.add(id);
      }
    }
  }

  const currentRowMap = new Map<number, any>();

  if (unifiedIds.length) {
    const currentRowsResult = await query(
      `
      SELECT id, data
      FROM unified
      WHERE id = ANY($1::int[])
      `,
      [unifiedIds]
    );

    for (const row of currentRowsResult.rows || []) {
      const id = Number(row?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      currentRowMap.set(id, isPlainObject(row?.data) ? row.data : {});
    }
  }

  const restoreHistoryItems: UnifiedChangeItemInput[] = [];
  const restoredItemIds: number[] = [];

  for (const item of loadedItems) {
    const itemId = Number(item.id);
    const unifiedId = Number(item.unified_id);

    if (!Number.isFinite(itemId) || itemId <= 0) {
      skipped.push({
        item_id: null,
        unified_id: Number.isFinite(unifiedId) ? unifiedId : null,
        reason: "invalid_item",
        message: "유효하지 않은 이력 item입니다.",
      });
      continue;
    }

    if (!Number.isFinite(unifiedId) || unifiedId <= 0) {
      skipped.push({
        item_id: itemId,
        unified_id: null,
        reason: "invalid_unified_id",
        message: "유효하지 않은 row id입니다.",
      });
      continue;
    }

    if (lockedByOtherSet.has(unifiedId)) {
      skipped.push({
        item_id: itemId,
        unified_id: unifiedId,
        reason: "locked_by_other",
        message: "다른 사용자가 현재 행을 편집 중입니다.",
      });
      continue;
    }

    const currentRowData = currentRowMap.get(unifiedId) ?? null;

    // -----------------------------------------------------------------------
    // 셀 수정 / 대량 수정 / 복원 이력 되돌리기
    // -----------------------------------------------------------------------
    if (
      item.action_type === "cell_update" ||
      item.action_type === "bulk_patch" ||
      item.action_type === "restore"
    ) {
      const columnKey = item.column_key;

      if (!columnKey) {
        skipped.push({
          item_id: itemId,
          unified_id: unifiedId,
          reason: "missing_column",
          message: "컬럼 정보가 없어 셀 복원을 할 수 없습니다.",
        });
        continue;
      }

      if (!isPlainObject(currentRowData)) {
        skipped.push({
          item_id: itemId,
          unified_id: unifiedId,
          reason: "deleted",
          message: "현재 행이 없어 복원할 수 없습니다.",
        });
        continue;
      }

      const currentValue = getCellValue(currentRowData, columnKey);

      if (!isSameJsonValue(currentValue, item.after_value)) {
        skipped.push({
          item_id: itemId,
          unified_id: unifiedId,
          reason: "conflict",
          message: "현재값이 이력의 변경 후 값과 달라 충돌로 제외했습니다.",
        });
        continue;
      }

      const patch = {
        [columnKey]: normalizeJsonValue(item.before_value),
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
          item_id: itemId,
          unified_id: unifiedId,
          reason: "update_failed",
          message: "복원 저장에 실패했습니다.",
        });
        continue;
      }

      const afterRestoreData = isPlainObject(saved?.data) ? saved.data : {};

      restoreHistoryItems.push({
        unified_id: unifiedId,
        column_key: columnKey,
        before_value: currentValue,
        after_value: normalizeJsonValue(item.before_value),
        before_row_data: currentRowData,
        after_row_data: afterRestoreData,
        action_type: "restore",
        restored_from_item_id: itemId,
      });

      currentRowMap.set(unifiedId, afterRestoreData);
      restoredItemIds.push(itemId);
      continue;
    }

    // -----------------------------------------------------------------------
    // 삭제 이력 복원: 삭제 전 row를 현재 unified에 다시 생성
    // -----------------------------------------------------------------------
    if (item.action_type === "bulk_delete") {
      if (isPlainObject(currentRowData)) {
        skipped.push({
          item_id: itemId,
          unified_id: unifiedId,
          reason: "conflict",
          message: "같은 row id가 현재 존재하여 삭제 복원을 할 수 없습니다.",
        });
        continue;
      }

      const restoreData = isPlainObject(item.before_row_data) ? item.before_row_data : {};

      const insertResult = await query(
        `
        WITH ins AS (
          INSERT INTO unified (id, data)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (id) DO NOTHING
          RETURNING id, data
        ),
        ins_order AS (
          INSERT INTO unified_order (unified_id, sort_key)
          SELECT
            ins.id,
            (SELECT COALESCE(MAX(sort_key), 0) + 1000 FROM unified_order)
          FROM ins
          WHERE NOT EXISTS (
            SELECT 1
            FROM unified_order
            WHERE unified_id = ins.id
          )
          RETURNING unified_id
        )
        SELECT id, data
        FROM ins
        `,
        [unifiedId, JSON.stringify(restoreData)]
      );

      const restored = insertResult.rows?.[0];

      if (!restored) {
        skipped.push({
          item_id: itemId,
          unified_id: unifiedId,
          reason: "restore_failed",
          message: "삭제된 행 복원에 실패했습니다.",
        });
        continue;
      }

      const afterRestoreData = isPlainObject(restored?.data) ? restored.data : restoreData;

      restoreHistoryItems.push({
        unified_id: unifiedId,
        column_key: null,
        before_value: null,
        after_value: null,
        before_row_data: null,
        after_row_data: afterRestoreData,
        action_type: "restore",
        restored_from_item_id: itemId,
      });

      currentRowMap.set(unifiedId, afterRestoreData);
      restoredItemIds.push(itemId);
      continue;
    }

    // -----------------------------------------------------------------------
    // 삽입 이력 되돌리기: 삽입 당시 그대로인 row만 삭제
    // -----------------------------------------------------------------------
    if (item.action_type === "insert") {
      if (!isPlainObject(currentRowData)) {
        skipped.push({
          item_id: itemId,
          unified_id: unifiedId,
          reason: "already_deleted",
          message: "이미 삭제된 행입니다.",
        });
        continue;
      }

      const originalInsertedData = isPlainObject(item.after_row_data) ? item.after_row_data : {};

      if (!isSameJsonValue(currentRowData, originalInsertedData)) {
        skipped.push({
          item_id: itemId,
          unified_id: unifiedId,
          reason: "conflict",
          message: "삽입 후 현재 행 값이 변경되어 자동 제거할 수 없습니다.",
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
          item_id: itemId,
          unified_id: unifiedId,
          reason: "delete_failed",
          message: "삽입 행 제거에 실패했습니다.",
        });
        continue;
      }

      restoreHistoryItems.push({
        unified_id: unifiedId,
        column_key: null,
        before_value: null,
        after_value: null,
        before_row_data: currentRowData,
        after_row_data: null,
        action_type: "restore",
        restored_from_item_id: itemId,
      });

      currentRowMap.delete(unifiedId);
      restoredItemIds.push(itemId);
      continue;
    }

    skipped.push({
      item_id: itemId,
      unified_id: unifiedId,
      reason: "unsupported_action",
      message: "아직 지원하지 않는 이력 유형입니다.",
    });
  }

  let restoreOperationId: string | null = null;

  if (restoreHistoryItems.length) {
    const actor = await getChangeHistoryActor();

    const firstSourceOperationId = loadedItems.find((item) =>
      restoredItemIds.includes(item.id)
    )?.operation_id;

    const historyResult = await recordUnifiedChangeHistory({
      action_type: "restore",
      changed_by_username: actor.username,
      changed_by_name: actor.name,
      description: `통합관리 선택 복원 ${restoreHistoryItems.length}건`,
      restored_from_operation_id: firstSourceOperationId ?? null,
      restore_reason: restoreReason || null,
      items: restoreHistoryItems,
    });

    restoreOperationId = historyResult?.operation_id ?? null;
  }

  return NextResponse.json({
    ok: true,
    requestedCount: itemIds.length,
    loadedCount: loadedItems.length,
    restoredCount: restoredItemIds.length,
    skippedCount: skipped.length,
    restoredItemIds,
    skipped,
    restoreOperationId,
  });
}