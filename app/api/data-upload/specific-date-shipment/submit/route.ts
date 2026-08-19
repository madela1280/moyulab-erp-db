import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

type SubmitItem = {
  unifiedId: number;
  shippingDate: string;
};

function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

function isValidDate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function buildFailRow(unifiedId: number, message: string) {
  return { unifiedId, message };
}

// ✅ 특정일자출고: 체크된 행의 택배발송일을 통합관리에 저장한다.
// (unified/locks 스키마 변경 없음, data JSONB에 택배발송일 필드만 병합)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const rawItems: any[] = Array.isArray(body?.items) ? body.items : [];

    const items: SubmitItem[] = rawItems.map((raw) => ({
      unifiedId: Number(raw?.unifiedId),
      shippingDate: normalizeText(raw?.shippingDate),
    }));

    if (!items.length) {
      return NextResponse.json(
        { ok: false, message: "전송할 체크 행이 없습니다.", successCount: 0, failedRows: [] },
        { status: 400 }
      );
    }

    const failedRows: Array<{ unifiedId: number; message: string }> = [];

    for (const item of items) {
      if (!Number.isFinite(item.unifiedId) || item.unifiedId <= 0) {
        failedRows.push(buildFailRow(item.unifiedId, "통합관리 행 정보가 올바르지 않습니다."));
        continue;
      }
      if (!isValidDate(item.shippingDate)) {
        failedRows.push(buildFailRow(item.unifiedId, "택배발송일을 올바르게 입력하세요(YYYY-MM-DD)."));
      }
    }

    if (failedRows.length) {
      return NextResponse.json(
        { ok: false, message: "전송할 수 없는 행이 포함되어 있습니다.", successCount: 0, failedRows },
        { status: 400 }
      );
    }

    // 중복 unifiedId 체크
    const seen = new Set<number>();
    for (const item of items) {
      if (seen.has(item.unifiedId)) {
        failedRows.push(buildFailRow(item.unifiedId, "동일한 통합관리 행이 중복 선택되었습니다."));
      }
      seen.add(item.unifiedId);
    }

    if (failedRows.length) {
      return NextResponse.json(
        { ok: false, message: "전송할 수 없는 행이 포함되어 있습니다.", successCount: 0, failedRows },
        { status: 400 }
      );
    }

    const ids = items.map((item) => item.unifiedId);
    const existing = await query(`SELECT id, data FROM unified WHERE id = ANY($1::int[])`, [ids]);

    const rowMap = new Map<number, Record<string, any>>();
    for (const row of (existing as any)?.rows ?? []) {
      const id = Number(row.id);
      rowMap.set(id, row.data && typeof row.data === "object" ? row.data : {});
    }

    // ✅ 이미 택배발송일이 채워진 행(다른 관리자가 먼저 처리한 경우)은 덮어쓰지 않고 실패 처리
    for (const item of items) {
      const data = rowMap.get(item.unifiedId);

      if (!data) {
        failedRows.push(buildFailRow(item.unifiedId, "통합관리 행을 찾을 수 없습니다."));
        continue;
      }

      const current = normalizeText(data["택배발송일"]);
      if (current) {
        failedRows.push(buildFailRow(item.unifiedId, `이미 택배발송일이 있습니다.(${current})`));
      }
    }

    if (failedRows.length) {
      return NextResponse.json(
        { ok: false, message: "이미 처리된 행이 포함되어 있습니다.", successCount: 0, failedRows },
        { status: 409 }
      );
    }

    for (const item of items) {
      await query(
        `
        UPDATE unified
        SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb
        WHERE id = $2
        `,
        [JSON.stringify({ 택배발송일: item.shippingDate }), item.unifiedId]
      );
    }

    return NextResponse.json({
      ok: true,
      message: "전송이 완료되었습니다.",
      successCount: items.length,
      failedRows: [],
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        message: e?.message || "특정일자출고 전송 처리에 실패했습니다.",
        successCount: 0,
        failedRows: [],
      },
      { status: 500 }
    );
  }
}
