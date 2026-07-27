// app/api/backup-restore/history-restore/operations/route.ts

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * GET /api/backup-restore/history-restore/operations
 *
 * query:
 * - mode=today | recent7 | date
 * - date=YYYY-MM-DD  // mode=date일 때 사용
 * - limit=100
 *
 * 기본 원칙:
 * - 로그인한 사용자 본인 작업만 조회
 * - today: 오늘 저장된 작업
 * - recent7: 오늘 제외 최근 7일
 * - date: 선택한 특정 날짜
 */

function normalizeMode(v: any): "today" | "recent7" | "date" {
  const mode = String(v ?? "").trim();
  if (mode === "recent7") return "recent7";
  if (mode === "date") return "date";
  return "today";
}

function normalizeDate(v: any) {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  return s;
}

function normalizeLimit(v: any) {
  const n = Math.floor(Number(v ?? 100));
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(n, 500);
}

export async function GET(req: Request) {
  const user = await getSessionUser();

  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const mode = normalizeMode(url.searchParams.get("mode"));
  const date = normalizeDate(url.searchParams.get("date"));
  const limit = normalizeLimit(url.searchParams.get("limit"));

  const params: any[] = [user.username, limit];

  let dateWhere = "";

  if (mode === "today") {
    dateWhere = `
      AND (created_at AT TIME ZONE 'Asia/Seoul')::date =
          (NOW() AT TIME ZONE 'Asia/Seoul')::date
    `;
  } else if (mode === "recent7") {
    dateWhere = `
      AND (created_at AT TIME ZONE 'Asia/Seoul')::date >=
          ((NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '7 days')
      AND (created_at AT TIME ZONE 'Asia/Seoul')::date <
          (NOW() AT TIME ZONE 'Asia/Seoul')::date
    `;
  } else {
    if (!date) {
      return NextResponse.json(
        { error: "INVALID_DATE", message: "date must be YYYY-MM-DD" },
        { status: 400 }
      );
    }

    params.push(date);

    dateWhere = `
      AND (created_at AT TIME ZONE 'Asia/Seoul')::date = $3::date
    `;
  }

  const sql = `
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
    WHERE domain = 'unified'
      AND changed_by_username = $1
      ${dateWhere}
    ORDER BY created_at DESC
    LIMIT $2
  `;

  const r = await query(sql, params);

  return NextResponse.json({
    ok: true,
    mode,
    date: mode === "date" ? date : null,
    username: user.username,
    count: r.rows.length,
    operations: r.rows,
  });
}