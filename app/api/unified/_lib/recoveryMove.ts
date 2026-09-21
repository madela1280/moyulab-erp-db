// app/api/unified/_lib/recoveryMove.ts
//
// "회수완료 이동/복구" 기능 전용 로직.
// - 통합관리(unified) -> 회수1(recovery1) 이동, 회수1 -> 통합관리 복구.
// - 대상 판정은 화면 상태뱃지(calcUnifiedStatus)와 동일한 반납완료일 파싱 로직을 그대로 재사용.
// - UnifiedGrid.tsx / sync-engine.ts / lock-engine.ts 는 전혀 사용하지 않음(완전 별도 배치 기능).

import { Pool } from "pg";
import { parseUnifiedCell } from "@/unified/status/parseUnifiedDate";

export const MOVE_BATCH_MAX = 300;

const pool =
  (globalThis as any).__recoveryMovePool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

(globalThis as any).__recoveryMovePool = pool;

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

// ✅ "반납완료일이 기준일 이전"이면 calcUnifiedStatus 규칙상 항상 회수완료(=대여중 아님)이므로
//    이 한 조건만으로 스펙의 "반납완료일 이전 + 대여중 아님"을 동시에 만족한다.
function isEligibleByCutoff(data: Record<string, any>, cutoff: Date): boolean {
  const completed = parseUnifiedCell(data?.["반납완료일"]);
  if (completed.kind !== "date") return false;
  return completed.date.getTime() <= cutoff.getTime();
}

function isStillEligible(data: Record<string, any>): boolean {
  const completed = parseUnifiedCell(data?.["반납완료일"]);
  return completed.kind === "date";
}

export type MovePreviewItem = {
  id: number;
  기기번호: string;
  수취인명: string;
  거래처분류: string;
  반납완료일: string;
  종료일: string;
};

export async function previewMoveToRecovery1(
  cutoffISO: string,
  limit: number
): Promise<{ totalCount: number; items: MovePreviewItem[] }> {
  const cutoff = new Date(cutoffISO);
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error("INVALID_CUTOFF");
  }

  const r = await pool.query(
    `
    SELECT u.id, o.sort_key, u.data
    FROM unified u
    JOIN unified_order o ON o.unified_id = u.id
    `
  );

  const matched: Array<{ id: number; sort_key: number; data: any }> = [];
  for (const row of r.rows || []) {
    const data = row?.data && typeof row.data === "object" ? row.data : {};
    if (isEligibleByCutoff(data, cutoff)) {
      matched.push({ id: Number(row.id), sort_key: Number(row.sort_key), data });
    }
  }

  matched.sort((a, b) => a.sort_key - b.sort_key);

  const items: MovePreviewItem[] = matched.slice(0, limit).map((m) => ({
    id: m.id,
    기기번호: normalizeString(m.data?.["기기번호"]),
    수취인명: normalizeString(m.data?.["수취인명"]),
    거래처분류: normalizeString(m.data?.["거래처분류"]),
    반납완료일: normalizeString(m.data?.["반납완료일"]),
    종료일: normalizeString(m.data?.["종료일"]),
  }));

  return { totalCount: matched.length, items };
}

async function migContractMapExists(client: any): Promise<boolean> {
  const r = await client.query(`SELECT to_regclass('public.mig_contract_map') AS reg`);
  return !!r.rows?.[0]?.reg;
}

async function updateContractMapTarget(
  client: any,
  data: Record<string, any>,
  target: "unified" | "recovery1",
  targetId: number
) {
  const contractId = normalizeString(data?.__mig?.contract_id);
  if (!contractId) return;

  await client.query(
    `
    UPDATE mig_contract_map
    SET target = $2, target_id = $3, version = version + 1
    WHERE contract_id = $1
    `,
    [contractId, target, targetId]
  );
}

export type MoveResult = {
  movedCount: number;
  movedIds: number[];
  skippedIds: number[];
};

export async function executeMoveToRecovery1(
  ids: number[],
  actor: { username: string | null; name: string | null }
): Promise<MoveResult> {
  const safeIds = Array.from(
    new Set(ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))
  ).slice(0, MOVE_BATCH_MAX);

  if (!safeIds.length) return { movedCount: 0, movedIds: [], skippedIds: [] };

  const client = await pool.connect();
  const movedIds: number[] = [];
  const skippedIds: number[] = [];
  const movedBefore: Array<{ id: number; data: any }> = [];

  try {
    await client.query("BEGIN");

    const hasMap = await migContractMapExists(client);

    const maxSortR = await client.query(
      `SELECT COALESCE(MAX(sort_key), 0)::numeric AS m FROM recovery1_order`
    );
    let runningSort = Number(maxSortR.rows?.[0]?.m ?? 0);

    for (const id of safeIds) {
      const sel = await client.query(
        `SELECT data FROM unified WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const row = sel.rows?.[0];
      if (!row) {
        skippedIds.push(id);
        continue;
      }

      const data = row.data && typeof row.data === "object" ? row.data : {};
      if (!isStillEligible(data)) {
        skippedIds.push(id);
        continue;
      }

      const sortKeyR = await client.query(
        `SELECT sort_key FROM unified_order WHERE unified_id = $1`,
        [id]
      );
      const originalSortKey = sortKeyR.rows?.[0]?.sort_key ?? null;

      const newData = {
        ...data,
        __mig_restore: {
          from_unified_id: id,
          unified_sort_key: originalSortKey,
          moved_at: new Date().toISOString(),
          moved_by: actor.username,
        },
      };

      const ins = await client.query(
        `INSERT INTO recovery1 (data) VALUES ($1::jsonb) RETURNING id`,
        [JSON.stringify(newData)]
      );
      const newRecoveryId = Number(ins.rows[0].id);

      runningSort += 1000;
      await client.query(
        `INSERT INTO recovery1_order (recovery1_id, sort_key) VALUES ($1, $2)`,
        [newRecoveryId, runningSort]
      );

      await client.query(`DELETE FROM unified_order WHERE unified_id = $1`, [id]);
      await client.query(`DELETE FROM unified WHERE id = $1`, [id]);

      if (hasMap) {
        await updateContractMapTarget(client, data, "recovery1", newRecoveryId);
      }

      movedIds.push(id);
      movedBefore.push({ id, data });
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { movedCount: movedIds.length, movedIds, skippedIds };
}

export type RestorePreviewItem = {
  id: number;
  기기번호: string;
  수취인명: string;
  거래처분류: string;
  반납완료일: string;
};

export async function previewRestoreToUnified(
  limit: number
): Promise<{ totalCount: number; items: RestorePreviewItem[] }> {
  const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM recovery1`);
  const totalCount = Number(totalR.rows?.[0]?.c ?? 0);

  const r = await pool.query(
    `
    SELECT r.id, r.data
    FROM recovery1 r
    JOIN recovery1_order o ON o.recovery1_id = r.id
    ORDER BY o.sort_key DESC
    LIMIT $1
    `,
    [limit]
  );

  const items: RestorePreviewItem[] = (r.rows || []).map((row: any) => {
    const data = row?.data && typeof row.data === "object" ? row.data : {};
    return {
      id: Number(row.id),
      기기번호: normalizeString(data?.["기기번호"]),
      수취인명: normalizeString(data?.["수취인명"]),
      거래처분류: normalizeString(data?.["거래처분류"]),
      반납완료일: normalizeString(data?.["반납완료일"]),
    };
  });

  return { totalCount, items };
}

export async function executeRestoreToUnified(
  ids: number[],
  actor: { username: string | null; name: string | null }
): Promise<MoveResult> {
  const safeIds = Array.from(
    new Set(ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))
  ).slice(0, MOVE_BATCH_MAX);

  if (!safeIds.length) return { movedCount: 0, movedIds: [], skippedIds: [] };

  const client = await pool.connect();
  const movedIds: number[] = [];
  const skippedIds: number[] = [];

  try {
    await client.query("BEGIN");

    const hasMap = await migContractMapExists(client);

    const maxSortR = await client.query(
      `SELECT COALESCE(MAX(sort_key), 0)::numeric AS m FROM unified_order`
    );
    let runningSort = Number(maxSortR.rows?.[0]?.m ?? 0);

    for (const id of safeIds) {
      const sel = await client.query(
        `SELECT data FROM recovery1 WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const row = sel.rows?.[0];
      if (!row) {
        skippedIds.push(id);
        continue;
      }

      const data = row.data && typeof row.data === "object" ? row.data : {};
      const restoreInfo = data?.__mig_restore && typeof data.__mig_restore === "object" ? data.__mig_restore : null;

      const newData: Record<string, any> = { ...data };
      delete newData.__mig_restore;

      const ins = await client.query(
        `INSERT INTO unified (data) VALUES ($1::jsonb) RETURNING id`,
        [JSON.stringify(newData)]
      );
      const newUnifiedId = Number(ins.rows[0].id);

      let sortKey = Number(restoreInfo?.unified_sort_key);
      if (!Number.isFinite(sortKey)) {
        runningSort += 1000;
        sortKey = runningSort;
      }

      await client.query(
        `INSERT INTO unified_order (unified_id, sort_key) VALUES ($1, $2)`,
        [newUnifiedId, sortKey]
      );

      await client.query(`DELETE FROM recovery1_order WHERE recovery1_id = $1`, [id]);
      await client.query(`DELETE FROM recovery1 WHERE id = $1`, [id]);

      if (hasMap) {
        await updateContractMapTarget(client, data, "unified", newUnifiedId);
      }

      movedIds.push(newUnifiedId);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { movedCount: movedIds.length, movedIds, skippedIds };
}
