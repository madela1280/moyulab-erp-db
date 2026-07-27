// app/unified/change-history/serverChangeHistory.ts

import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export type UnifiedChangeActionType =
  | "cell_update"
  | "bulk_patch"
  | "bulk_delete"
  | "insert"
  | "restore";

export type ChangeHistoryActor = {
  username: string | null;
  name: string | null;
};

export type UnifiedChangeItemInput = {
  unified_id: number | null;
  column_key?: string | null;
  before_value?: any;
  after_value?: any;
  before_row_data?: Record<string, any> | null;
  after_row_data?: Record<string, any> | null;
  action_type: UnifiedChangeActionType;
  restored_from_item_id?: number | null;
};

export type RecordUnifiedChangeHistoryInput = {
  operation_id?: string;
  action_type: UnifiedChangeActionType;
  changed_by_username?: string | null;
  changed_by_name?: string | null;
  description?: string | null;
  restored_from_operation_id?: string | null;
  restore_reason?: string | null;
  items: UnifiedChangeItemInput[];
};

export type RecordUnifiedChangeHistoryResult = {
  ok: true;
  operation_id: string;
  item_count: number;
};

function normalizeJsonValue(value: any) {
  return value === undefined ? null : value;
}

function isSameJsonValue(a: any, b: any) {
  return JSON.stringify(normalizeJsonValue(a)) === JSON.stringify(normalizeJsonValue(b));
}

export function createUnifiedChangeOperationId() {
  return `unified_${Date.now()}_${randomUUID()}`;
}

export async function getChangeHistoryActor(): Promise<ChangeHistoryActor> {
  const user = await getSessionUser();

  return {
    username: user?.username ?? null,
    name: user?.name ?? null,
  };
}

export function buildUnifiedCellChangeItems(params: {
  unifiedId: number;
  beforeData: Record<string, any>;
  afterData: Record<string, any>;
  columnKeys: string[];
  actionType: UnifiedChangeActionType;
}): UnifiedChangeItemInput[] {
  const unifiedId = Number(params.unifiedId);
  if (!Number.isFinite(unifiedId) || unifiedId <= 0) return [];

  const beforeData =
    params.beforeData && typeof params.beforeData === "object" && !Array.isArray(params.beforeData)
      ? params.beforeData
      : {};

  const afterData =
    params.afterData && typeof params.afterData === "object" && !Array.isArray(params.afterData)
      ? params.afterData
      : {};

  const columnKeys = Array.from(
    new Set(
      (params.columnKeys || [])
        .map((key) => String(key ?? "").trim())
        .filter(Boolean)
    )
  );

  const items: UnifiedChangeItemInput[] = [];

  for (const key of columnKeys) {
    const beforeValue = normalizeJsonValue(beforeData[key]);
    const afterValue = normalizeJsonValue(afterData[key]);

    if (isSameJsonValue(beforeValue, afterValue)) continue;

    items.push({
      unified_id: unifiedId,
      column_key: key,
      before_value: beforeValue,
      after_value: afterValue,
      before_row_data: beforeData,
      after_row_data: afterData,
      action_type: params.actionType,
    });
  }

  return items;
}

export function buildUnifiedDeleteChangeItems(rows: Array<{ id: number; data: any }>) {
  const items: UnifiedChangeItemInput[] = [];

  for (const row of rows || []) {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id <= 0) continue;

    const data =
      row?.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? row.data
        : {};

    items.push({
      unified_id: id,
      column_key: null,
      before_value: null,
      after_value: null,
      before_row_data: data,
      after_row_data: null,
      action_type: "bulk_delete",
    });
  }

  return items;
}

export function buildUnifiedInsertChangeItems(rows: Array<{ id: number; data?: any }>) {
  const items: UnifiedChangeItemInput[] = [];

  for (const row of rows || []) {
    const id = Number(row?.id);
    if (!Number.isFinite(id) || id <= 0) continue;

    const data =
      row?.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? row.data
        : {};

    items.push({
      unified_id: id,
      column_key: null,
      before_value: null,
      after_value: null,
      before_row_data: null,
      after_row_data: data,
      action_type: "insert",
    });
  }

  return items;
}

export async function recordUnifiedChangeHistory(
  input: RecordUnifiedChangeHistoryInput
): Promise<RecordUnifiedChangeHistoryResult | null> {
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) return null;

  const operationId = input.operation_id || createUnifiedChangeOperationId();

  const normalizedItems = items.map((item) => ({
    unified_id:
      item.unified_id === null || item.unified_id === undefined
        ? null
        : Number(item.unified_id),
    column_key: item.column_key ?? null,
    before_value: normalizeJsonValue(item.before_value),
    after_value: normalizeJsonValue(item.after_value),
    before_row_data: item.before_row_data ?? null,
    after_row_data: item.after_row_data ?? null,
    action_type: item.action_type,
    restored_from_item_id: item.restored_from_item_id ?? null,
  }));

  const sql = `
    WITH op AS (
      INSERT INTO unified_change_operations (
        operation_id,
        domain,
        action_type,
        changed_by_username,
        changed_by_name,
        item_count,
        description,
        restored_from_operation_id,
        restore_reason
      )
      VALUES (
        $1,
        'unified',
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8
      )
      RETURNING operation_id
    ),
    ins_items AS (
      INSERT INTO unified_change_items (
        operation_id,
        unified_id,
        column_key,
        before_value,
        after_value,
        before_row_data,
        after_row_data,
        action_type,
        restored_from_item_id
      )
      SELECT
        (SELECT operation_id FROM op),
        NULLIF(x->>'unified_id', '')::int,
        NULLIF(x->>'column_key', ''),
        x->'before_value',
        x->'after_value',
        x->'before_row_data',
        x->'after_row_data',
        COALESCE(NULLIF(x->>'action_type', ''), $2),
        NULLIF(x->>'restored_from_item_id', '')::bigint
      FROM jsonb_array_elements($9::jsonb) AS x
      RETURNING id
    )
    SELECT
      (SELECT operation_id FROM op) AS operation_id,
      COUNT(*)::int AS item_count
    FROM ins_items
  `;

  const r = await query(sql, [
    operationId,
    input.action_type,
    input.changed_by_username ?? null,
    input.changed_by_name ?? null,
    normalizedItems.length,
    input.description ?? null,
    input.restored_from_operation_id ?? null,
    input.restore_reason ?? null,
    JSON.stringify(normalizedItems),
  ]);

  const row = r.rows?.[0];

  return {
    ok: true,
    operation_id: String(row?.operation_id ?? operationId),
    item_count: Number(row?.item_count ?? normalizedItems.length),
  };
}