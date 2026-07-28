// app/api/backup-restore/history-restore/operations/[operationId]/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * GET /api/backup-restore/history-restore/operations/[operationId]
 *
 * 역할:
 * - 선택한 operation의 상세 item 조회
 * - before / after / current 값 비교
 * - 복원 가능 / 충돌 / 삭제됨 / 이미삭제됨 상태 계산
 *
 * 기본 원칙:
 * - 로그인한 사용자 본인 작업만 조회
 * - unified_change_operations.changed_by_username 기준으로 제한
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

function buildItemStatus(params: {
  actionType: string;
  columnKey: string | null;
  currentRowData: any | null;
  beforeValue: any;
  afterValue: any;
  beforeRowData: any;
  afterRowData: any;
  isRestored: boolean;
}) {
  const actionType = normalizeString(params.actionType);
  const columnKey = params.columnKey ? normalizeString(params.columnKey) : null;

  const currentRowExists = isPlainObject(params.currentRowData);
  const currentCellValue = getCellValue(params.currentRowData, columnKey);

  // 셀 수정 / 대량 수정 / 복원 이력
  if (
    actionType === "cell_update" ||
    actionType === "bulk_patch" ||
    actionType === "restore"
  ) {
    if (!currentRowExists) {
      return {
        status: "deleted",
        statusLabel: "현재 행 없음",
        current_value: null,
        restorable: false,
      };
    }

    if (params.isRestored && isSameJsonValue(currentCellValue, params.beforeValue)) {
      return {
        status: "restored",
        statusLabel: "복원완료",
        current_value: currentCellValue,
        restorable: false,
      };
    }

    if (isSameJsonValue(currentCellValue, params.afterValue)) {
      return {
        status: "restorable",
        statusLabel: "복원가능",
        current_value: currentCellValue,
        restorable: true,
      };
    }

    return {
      status: "conflict",
      statusLabel: "충돌",
      current_value: currentCellValue,
      restorable: false,
    };
  }

  // 삭제 이력: 삭제 전 row를 다시 살릴 수 있는지 확인
  if (actionType === "bulk_delete") {
    if (params.isRestored && currentRowExists) {
      return {
        status: "restored",
        statusLabel: "복원완료",
        current_value: params.currentRowData,
        restorable: false,
      };
    }

    if (!currentRowExists) {
      return {
        status: "restorable",
        statusLabel: "복원가능",
        current_value: null,
        restorable: true,
      };
    }

    return {
      status: "conflict",
      statusLabel: "같은 row id가 현재 존재함",
      current_value: params.currentRowData,
      restorable: false,
    };
  }

  // 삽입 이력: 잘못 삽입한 행을 제거할 수 있는지 확인
  if (actionType === "insert") {
    if (params.isRestored && !currentRowExists) {
      return {
        status: "restored",
        statusLabel: "복원완료",
        current_value: null,
        restorable: false,
      };
    }

    if (!currentRowExists) {
      return {
        status: "already_deleted",
        statusLabel: "이미 삭제됨",
        current_value: null,
        restorable: false,
      };
    }

    if (isSameJsonValue(params.currentRowData, params.afterRowData ?? {})) {
      return {
        status: "restorable",
        statusLabel: "제거가능",
        current_value: params.currentRowData,
        restorable: true,
      };
    }

    return {
      status: "conflict",
      statusLabel: "삽입 후 현재값 변경됨",
      current_value: params.currentRowData,
      restorable: false,
    };
  }

  return {
    status: "unknown",
    statusLabel: "확인필요",
    current_value: currentCellValue,
    restorable: false,
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ operationId: string }> }
) {
  const user = await getSessionUser();

  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const params = await context.params;
  const operationId = normalizeString(params.operationId);

  if (!operationId) {
    return NextResponse.json(
      { error: "INVALID_OPERATION_ID" },
      { status: 400 }
    );
  }

  const opResult = await query(
    `
    SELECT
      operation_id,
      domain,
      action_type,
      changed_by_username,
      changed_by_name,
      item_count,
      description,
      restored_from_operation_id,
      restore_reason,
      created_at,
      to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS created_date,
      to_char(created_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI:SS') AS created_time
    FROM unified_change_operations
    WHERE operation_id = $1
      AND domain = 'unified'
      AND changed_by_username = $2
    LIMIT 1
    `,
    [operationId, user.username]
  );

  if (!opResult.rows.length) {
    return NextResponse.json(
      { error: "NOT_FOUND" },
      { status: 404 }
    );
  }

  const operation = opResult.rows[0];

  const itemsResult = await query(
    `
    SELECT
      id,
      operation_id,
      unified_id,
      column_key,
      before_value,
      after_value,
      before_row_data,
      after_row_data,
      action_type,
      restored_from_item_id,
      created_at
    FROM unified_change_items
    WHERE operation_id = $1
    ORDER BY id ASC
    `,
    [operationId]
  );

  const itemsRaw = itemsResult.rows || [];

   const itemIds = Array.from(
    new Set(
      itemsRaw
        .map((item: any) => Number(item?.id))
        .filter((id: number) => Number.isFinite(id) && id > 0)
        .map((id: number) => Math.floor(id))
    )
  );

  const restoredItemIdSet = new Set<number>();

  if (itemIds.length) {
    const restoredResult = await query(
      `
      SELECT DISTINCT restored_from_item_id
      FROM unified_change_items
      WHERE action_type = 'restore'
        AND restored_from_item_id = ANY($1::bigint[])
      `,
      [itemIds]
    );

    for (const row of restoredResult.rows || []) {
      const id = Number(row?.restored_from_item_id);
      if (Number.isFinite(id) && id > 0) {
        restoredItemIdSet.add(Math.floor(id));
      }
    }
  }

  const unifiedIds = Array.from(
    new Set(
      itemsRaw
        .map((item: any) => Number(item?.unified_id))
        .filter((id: number) => Number.isFinite(id) && id > 0)
        .map((id: number) => Math.floor(id))
    )
  );

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

      const data = isPlainObject(row?.data) ? row.data : {};
      currentRowMap.set(id, data);
    }
  }

  const rowNumberMap = new Map<number, number>();

  if (unifiedIds.length) {
    const rowNumberResult = await query(
      `
      WITH ordered AS (
        SELECT
          unified_id,
          ROW_NUMBER() OVER (ORDER BY sort_key ASC, unified_id ASC)::int AS row_number
        FROM unified_order
      )
      SELECT unified_id, row_number
      FROM ordered
      WHERE unified_id = ANY($1::int[])
      `,
      [unifiedIds]
    );

    for (const row of rowNumberResult.rows || []) {
      const unifiedId = Number(row?.unified_id);
      const rowNumber = Number(row?.row_number);

      if (
        Number.isFinite(unifiedId) &&
        unifiedId > 0 &&
        Number.isFinite(rowNumber) &&
        rowNumber > 0
      ) {
        rowNumberMap.set(Math.floor(unifiedId), Math.floor(rowNumber));
      }
    }
  }

  const items = itemsRaw.map((item: any) => {
    const itemId = Number(item?.id);
    const unifiedId = Number(item?.unified_id);
    const columnKey = item?.column_key === null ? null : normalizeString(item?.column_key);

    const currentRowData =
      Number.isFinite(unifiedId) && unifiedId > 0
        ? currentRowMap.get(unifiedId) ?? null
        : null;

    const statusInfo = buildItemStatus({
      actionType: item?.action_type,
      columnKey,
      currentRowData,
      beforeValue: item?.before_value,
      afterValue: item?.after_value,
      beforeRowData: item?.before_row_data,
      afterRowData: item?.after_row_data,
      isRestored: restoredItemIdSet.has(itemId),
    });

    return {
      id: itemId,
      operation_id: item?.operation_id,
      unified_id: Number.isFinite(unifiedId) ? unifiedId : null,
      row_number:
        Number.isFinite(unifiedId) && unifiedId > 0
          ? rowNumberMap.get(Math.floor(unifiedId)) ?? null
          : null,
      column_key: columnKey,
      action_type: item?.action_type,

      before_value: item?.before_value,
      after_value: item?.after_value,
      current_value: statusInfo.current_value,

      before_row_data: item?.before_row_data,
      after_row_data: item?.after_row_data,
      current_row_data: currentRowData,

      status: statusInfo.status,
      statusLabel: statusInfo.statusLabel,
      restorable: statusInfo.restorable,

      restored_from_item_id: item?.restored_from_item_id,
      created_at: item?.created_at,
    };
  });

  const summary = {
    total: items.length,
    restorable: items.filter((item: any) => item.restorable).length,
    restored: items.filter((item: any) => item.status === "restored").length,
    conflict: items.filter((item: any) => item.status === "conflict").length,
    deleted: items.filter((item: any) => item.status === "deleted").length,
    already_deleted: items.filter((item: any) => item.status === "already_deleted").length,
    unknown: items.filter((item: any) => item.status === "unknown").length,
  };

  return NextResponse.json({
    ok: true,
    operation,
    summary,
    items,
  });
}