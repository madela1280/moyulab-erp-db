// app/api/unified/move-to-recovery1/route.ts
//
// 통합관리 -> 회수1 이동(배치). GET=미리보기, POST=실행.
// GET  ?cutoff=YYYY-MM-DD&limit=300
// POST { ids: number[] }

import { NextResponse } from "next/server";
import {
  MOVE_BATCH_MAX,
  executeMoveToRecovery1,
  previewMoveToRecovery1,
} from "@/api/unified/_lib/recoveryMove";
import {
  buildUnifiedDeleteChangeItems,
  getChangeHistoryActor,
  recordUnifiedChangeHistory,
} from "@/unified/change-history/serverChangeHistory";
import { query } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cutoff = searchParams.get("cutoff") ?? "";
  const limitRaw = Number(searchParams.get("limit") ?? MOVE_BATCH_MAX);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MOVE_BATCH_MAX) : MOVE_BATCH_MAX;

  if (!cutoff) {
    return NextResponse.json({ error: "INVALID_CUTOFF" }, { status: 400 });
  }

  try {
    const result = await previewMoveToRecovery1(cutoff, limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (String(e?.message) === "INVALID_CUTOFF") {
      return NextResponse.json({ error: "INVALID_CUTOFF" }, { status: 400 });
    }
    console.error("GET /api/unified/move-to-recovery1 error:", e);
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

  // 삭제 이력 기록용: 이동 전 원본 data를 미리 확보
  let beforeRows: Array<{ id: number; data: any }> = [];
  try {
    const r = await query(`SELECT id, data FROM unified WHERE id = ANY($1::int[])`, [ids]);
    beforeRows = (r.rows || []).map((x: any) => ({ id: Number(x.id), data: x.data }));
  } catch {
    // ignore(이력 기록용 부가정보 조회 실패는 실제 이동을 막지 않음)
  }

  try {
    const actor = await getChangeHistoryActor();
    const result = await executeMoveToRecovery1(ids, actor);

    try {
      const movedRows = beforeRows.filter((r) => result.movedIds.includes(r.id));
      const items = buildUnifiedDeleteChangeItems(movedRows).map((it) => ({
        ...it,
        action_type: "move_to_recovery1" as const,
      }));

      if (items.length) {
        await recordUnifiedChangeHistory({
          action_type: "move_to_recovery1",
          changed_by_username: actor.username,
          changed_by_name: actor.name,
          description: `통합관리 -> 회수1 이동 ${items.length}건`,
          items,
        });
      }
    } catch (err) {
      console.warn("move-to-recovery1 change history record failed (ignored):", err);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("POST /api/unified/move-to-recovery1 error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
