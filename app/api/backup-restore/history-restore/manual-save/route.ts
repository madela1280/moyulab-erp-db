// app/api/backup-restore/history-restore/manual-save/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { computeZeroExtensionDaysFromDates } from "@/views/unified/extensions/extensionCompute";
import { isGuideMigrationLocked } from "@/unified/migration-mode/guideMigrationLock";
import {
  buildUnifiedCellChangeItems,
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

function normalizeLower(v: any) {
  return normalizeString(v).toLowerCase();
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

// ✅ 거래처분류 → 안내분류 매핑 조회
async function findGuideByPartnerName(partnerName: string): Promise<string | null> {
  const p = normalizeString(partnerName);
  if (!p) return null;

  const r = await query(
    `
    SELECT guide_name
    FROM partner_guide_map
    WHERE partner_name = $1
    LIMIT 1
    `,
    [p]
  );

  const g = normalizeString(r.rows?.[0]?.guide_name);
  return g ? g : null;
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

type DeviceInfo = {
  제품명: string | null;
  기종: string | null;
  구매렌탈: string | null;
  에러횟수: string | null;
};

async function getExistingDeviceTables(): Promise<string[]> {
  const cached = (globalThis as any).__existingDeviceTables;
  if (Array.isArray(cached) && cached.length >= 0) return cached;

  const names = Array.from(DEVICE_TABLES);
  const r = await query(
    `
    SELECT
      t.name,
      to_regclass('public.' || t.name) AS reg
    FROM unnest($1::text[]) AS t(name)
    `,
    [names]
  );

  const exists = (r.rows || [])
    .filter((x: any) => !!x?.reg)
    .map((x: any) => String(x.name))
    .filter(Boolean);

  (globalThis as any).__existingDeviceTables = exists;
  return exists;
}

async function findDeviceInfoBySystemNo(deviceNo: string): Promise<DeviceInfo | null> {
  const needle = normalizeLower(deviceNo);
  if (!needle) return null;

  const tables = await getExistingDeviceTables();
  if (!tables.length) return null;

  const parts: string[] = [];

  for (let i = 0; i < tables.length; i++) {
    const tableName = tables[i];

    parts.push(`
      SELECT data, ${i + 1} AS pri
      FROM ${tableName}
      WHERE lower(COALESCE(data->>'시스템 기기번호','')) = $1::text
    `);
  }

  const sql = `
    SELECT data
    FROM (
      ${parts.join(" UNION ALL ")}
    ) x
    ORDER BY x.pri ASC
    LIMIT 1
  `;

  const r = await query(sql, [needle]);
  if (!r.rows?.length) return null;

  const data =
    r.rows[0]?.data && typeof r.rows[0].data === "object"
      ? r.rows[0].data
      : {};

  const 제품명 = normalizeString((data as any)["제품명"]) || "";
  const 기종 = normalizeString((data as any)["기종"]) || "";
  const 구매렌탈 = normalizeString((data as any)["구매/렌탈"]) || "";
  const 에러횟수 = normalizeString((data as any)["에러횟수"]);

  return {
    제품명: 제품명 ? 제품명 : null,
    기종: 기종 ? 기종 : null,
    구매렌탈: 구매렌탈 ? 구매렌탈 : null,
    에러횟수: 에러횟수 ? 에러횟수 : null,
  };
}

async function buildManualAutoPatch(params: {
  currentRowData: Record<string, any>;
  columnKey: string;
  nextValue: any;
}) {
  const currentRowData = isPlainObject(params.currentRowData)
    ? params.currentRowData
    : {};

  const columnKey = normalizeString(params.columnKey);
  const nextValue = params.nextValue;

  const patch: Record<string, any> = {
    [columnKey]: nextValue,
  };

  // ✅ 거래처분류 → 안내분류 자동매핑
  if (columnKey === "거래처분류") {
    const lockedByExistingRow = isGuideMigrationLocked(currentRowData);
    const lockedByPatch = isGuideMigrationLocked(patch);

    if (!lockedByExistingRow && !lockedByPatch) {
      const partnerName = normalizeString(nextValue);

      if (!partnerName) {
        patch["안내분류"] = null;
      } else {
        const guide = await findGuideByPartnerName(partnerName);
        patch["안내분류"] = guide ? guide : null;
      }
    }
  }

  // ✅ 기기번호 → 기종/구매렌탈/에러횟수/제품 자동매칭
  if (columnKey === "기기번호") {
    const deviceNo = normalizeString(nextValue);

    if (deviceNo) {
      const info = await findDeviceInfoBySystemNo(deviceNo);

      if (info) {
        patch["기종"] = info.기종;
        patch["구매/렌탈"] = info.구매렌탈;
        patch["에러횟수"] = info.에러횟수;
        patch["제품"] = info.제품명;
      } else {
        patch["기종"] = null;
        patch["구매/렌탈"] = null;
        patch["에러횟수"] = null;
        patch["제품"] = null;
      }
    } else {
      patch["기종"] = null;
      patch["구매/렌탈"] = null;
      patch["에러횟수"] = null;
      patch["제품"] = null;
    }
  }

  // ✅ 시작일/종료일 수정 시 0차연장 최초 1회 자동계산
  if (
    columnKey !== "0차연장" &&
    (columnKey === "시작일" || columnKey === "종료일")
  ) {
    const mergedData = {
      ...currentRowData,
      ...patch,
    };

    const zeroRaw = normalizeString(mergedData?.["0차연장"]);
    const startRaw = normalizeString(mergedData?.["시작일"]);
    const endRaw = normalizeString(mergedData?.["종료일"]);

    if (!zeroRaw) {
      const computed = computeZeroExtensionDaysFromDates(startRaw, endRaw);

      if (computed != null) {
        patch["0차연장"] = computed;
      }
    }
  }

  return patch;
}

async function buildManualAutoCompletedInsertData(inputData: Record<string, any>) {
  const patch: Record<string, any> = isPlainObject(inputData)
    ? { ...inputData }
    : {};

  if (Object.prototype.hasOwnProperty.call(patch, "거래처분류")) {
    const lockedByPatch = isGuideMigrationLocked(patch);

    if (!lockedByPatch) {
      const partnerName = normalizeString(patch["거래처분류"]);

      if (!partnerName) {
        patch["안내분류"] = null;
      } else {
        const guide = await findGuideByPartnerName(partnerName);
        patch["안내분류"] = guide ? guide : null;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "기기번호")) {
    const deviceNo = normalizeString(patch["기기번호"]);

    if (deviceNo) {
      const info = await findDeviceInfoBySystemNo(deviceNo);

      if (info) {
        patch["기종"] = info.기종;
        patch["구매/렌탈"] = info.구매렌탈;
        patch["에러횟수"] = info.에러횟수;
        patch["제품"] = info.제품명;
      } else {
        patch["기종"] = null;
        patch["구매/렌탈"] = null;
        patch["에러횟수"] = null;
        patch["제품"] = null;
      }
    } else {
      patch["기종"] = null;
      patch["구매/렌탈"] = null;
      patch["에러횟수"] = null;
      patch["제품"] = null;
    }
  }

  if (
    !Object.prototype.hasOwnProperty.call(patch, "0차연장") &&
    (Object.prototype.hasOwnProperty.call(patch, "시작일") ||
      Object.prototype.hasOwnProperty.call(patch, "종료일"))
  ) {
    const zeroRaw = normalizeString(patch?.["0차연장"]);
    const startRaw = normalizeString(patch?.["시작일"]);
    const endRaw = normalizeString(patch?.["종료일"]);

    if (!zeroRaw) {
      const computed = computeZeroExtensionDaysFromDates(startRaw, endRaw);

      if (computed != null) {
        patch["0차연장"] = computed;
      }
    }
  }

  return patch;
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

  // ✅ 삭제행 복원처럼 기준행이 없는 insert는 "통합관리 맨 끝"이 아니라
  //    "마지막 실제 데이터 행 바로 아래"에 넣는다.
  // - 통합관리에는 아래쪽에 빈 행이 많이 존재할 수 있음
  // - MAX(sort_key)+1000을 쓰면 빈 행들 아래로 들어가서 사용자가 찾기 어려움
  // - __cellStyle 같은 메타 키는 실제 데이터로 보지 않음
  const result = await query(
    `
    WITH last_data AS (
      SELECT o.sort_key
      FROM unified_order o
      JOIN unified u ON u.id = o.unified_id
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_each_text(COALESCE(u.data, '{}'::jsonb)) kv
        WHERE kv.key !~ '^__'
          AND kv.value IS NOT NULL
          AND btrim(kv.value) <> ''
      )
      ORDER BY o.sort_key DESC, o.unified_id DESC
      LIMIT 1
    ),
    next_row AS (
      SELECT MIN(o.sort_key) AS next_sort_key
      FROM unified_order o
      WHERE o.sort_key > (SELECT sort_key FROM last_data)
    ),
    max_row AS (
      SELECT COALESCE(MAX(sort_key), 0) AS max_sort_key
      FROM unified_order
    )
    SELECT
      (SELECT sort_key FROM last_data) AS last_data_sort_key,
      (SELECT next_sort_key FROM next_row) AS next_sort_key,
      (SELECT max_sort_key FROM max_row) AS max_sort_key
    `
  );

  const row = result.rows?.[0];

  const lastDataSortKey = Number(row?.last_data_sort_key);
  const nextSortKey = Number(row?.next_sort_key);
  const maxSortKey = Number(row?.max_sort_key);

  if (Number.isFinite(lastDataSortKey)) {
    if (Number.isFinite(nextSortKey) && nextSortKey > lastDataSortKey) {
      return (lastDataSortKey + nextSortKey) / 2;
    }

    return lastDataSortKey + 1000;
  }

  return (Number.isFinite(maxSortKey) ? maxSortKey : 0) + 1000;
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

       const patch = await buildManualAutoPatch({
      currentRowData,
      columnKey,
      nextValue,
    });

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

        const changedColumnKeys = Array.from(
      new Set(
        Object.keys(patch)
          .map((key) => normalizeString(key))
          .filter(Boolean)
      )
    );

    const items = buildUnifiedCellChangeItems({
      unifiedId,
      beforeData: currentRowData,
      afterData: afterRowData,
      columnKeys: changedColumnKeys,
      actionType: "bulk_patch",
    });

    historyItems.push(...items);

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
    const insertData = await buildManualAutoCompletedInsertData(item.data);

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
      [JSON.stringify(insertData), sortKey]
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
    const insertedData = isPlainObject(inserted?.data) ? inserted.data : insertData;

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