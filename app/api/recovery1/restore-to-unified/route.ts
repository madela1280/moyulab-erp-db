// app/api/recovery1/restore-to-unified/route.ts
//
// 회수1 -> 통합관리 복구(배치). GET=미리보기, POST=실행.
// GET  ?limit=300
// POST { ids: number[] }

import { NextResponse } from "next/server";
import {
  MOVE_BATCH_MAX,
  executeRestoreToUnified,
  previewRestoreToUnified,
} from "@/api/unified/_lib/recoveryMove";
import {
  getChangeHistoryActor,
  recordUnifiedChangeHistory,
} from "@/unified/change-history/serverChangeHistory";
import { query } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get("limit") ?? MOVE_BATCH_MAX);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MOVE_BATCH_MAX) : MOVE_BATCH_MAX;

  try {
    const result = await previewRestoreToUnified(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("GET /api/recovery1/restore-to-unified error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const idsRaw = body?.ids;

  if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }
  if (idsRaw.length > MOVE_BATCH_MAX) {
    return NextResponse.json({ error: "TOO_MANY_IDS", max: MOVE_BATCH_MAX }, { status: 400 });
  }

  const ids = idsRaw.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0);

  let beforeCount = 0;
  try {
    const r = await query(`SELECT COUNT(*)::int AS c FROM recovery1 WHERE id = ANY($1::int[])`, [ids]);
    beforeCount = Number(r.rows?.[0]?.c ?? 0);
  } catch {
    // ignore
  }

  try {
    const actor = await getChangeHistoryActor();
    const result = await executeRestoreToUnified(ids, actor);

    try {
      if (result.movedCount) {
        await recordUnifiedChangeHistory({
          action_type: "restore_from_recovery1",
          changed_by_username: actor.username,
          changed_by_name: actor.name,
          description: `회수1 -> 통합관리 복구 ${result.movedCount}건`,
          items: result.movedIds.map((newId) => ({
            unified_id: newId,
            action_type: "restore_from_recovery1" as const,
            before_row_data: null,
            after_row_data: null,
          })),
        });
      }
    } catch (err) {
      console.warn("restore-to-unified change history record failed (ignored):", err);
    }

    void beforeCount;
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("POST /api/recovery1/restore-to-unified error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
