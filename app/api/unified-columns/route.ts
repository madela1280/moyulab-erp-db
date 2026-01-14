import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { unifiedColumns } from "@/unified/columns/unifiedColumns";

/**
 * 필요 DB 테이블(1회 생성):
 *
 * CREATE TABLE IF NOT EXISTS unified_custom_columns (
 *   key text PRIMARY KEY,
 *   sort_key numeric NOT NULL,
 *   created_by text,
 *   created_at timestamptz NOT NULL DEFAULT now()
 * );
 */

const BASE_STEP = 1000;

async function getGlobalOrder(): Promise<Array<{ key: string; sort_key: number }>> {
  const base = (unifiedColumns as unknown as string[]).map((k, i) => ({
    key: k,
    sort_key: (i + 1) * BASE_STEP,
  }));

  // 커스텀 컬럼
  const r = await query(
    `SELECT key, sort_key::numeric AS sort_key, created_by, created_at
     FROM unified_custom_columns
     ORDER BY sort_key ASC, key ASC`
  );

  const custom = r.rows.map((x: any) => ({
    key: String(x.key),
    sort_key: Number(x.sort_key),
    created_by: x.created_by ?? null,
    created_at: x.created_at ?? null,
  }));

  // 합치기(커스텀에 기본 키가 들어오는 경우 기본 우선)
  const combined = [...base, ...custom.map((x) => ({ key: x.key, sort_key: x.sort_key }))].sort(
    (a, b) => a.sort_key - b.sort_key
  );

  const seen = new Set<string>();
  const dedup: Array<{ key: string; sort_key: number }> = [];
  for (const c of combined) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    dedup.push(c);
  }

  return dedup.sort((a, b) => a.sort_key - b.sort_key);
}

export async function GET() {
  // GET은 로그인 없이도 동작 가능(컬럼 목록 제공)하게 유지
  // (필요하면 추후 권한 정책으로 제한 가능)
  const order = await getGlobalOrder();

  const customR = await query(
    `SELECT key, created_by, created_at
     FROM unified_custom_columns
     ORDER BY created_at DESC, key ASC`
  );

  return NextResponse.json({
    order: order.map((x) => x.key),
    custom: customR.rows,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const referenceKey = String(body?.referenceKey ?? "").trim();
  const position = (String(body?.position ?? "after") as "after" | "before") === "before" ? "before" : "after";

  if (!name) return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "NAME_TOO_LONG" }, { status: 400 });

  // 기본 컬럼과 동일 이름 금지
  if ((unifiedColumns as unknown as string[]).includes(name)) {
    return NextResponse.json({ error: "DUPLICATE_WITH_BASE" }, { status: 409 });
  }

  // 기준 컬럼 유효성
  const global = await getGlobalOrder();
  const ref = global.find((x) => x.key === referenceKey);
  if (!ref) return NextResponse.json({ error: "INVALID_REFERENCE_KEY" }, { status: 400 });

  // 이미 존재하는 커스텀 키 중복 방지
  const exists = await query(`SELECT 1 FROM unified_custom_columns WHERE key=$1`, [name]);
  if (exists.rows.length) return NextResponse.json({ error: "DUPLICATE_CUSTOM_KEY" }, { status: 409 });

  // 새 sort_key 계산(열 삽입)
  const sorted = global.slice().sort((a, b) => a.sort_key - b.sort_key);
  const refIndex = sorted.findIndex((x) => x.key === referenceKey);

  let prevSort: number | null = null;
  let nextSort: number | null = null;

  if (position === "after") {
    prevSort = sorted[refIndex]?.sort_key ?? null;
    nextSort = sorted[refIndex + 1]?.sort_key ?? null;
  } else {
    nextSort = sorted[refIndex]?.sort_key ?? null;
    prevSort = sorted[refIndex - 1]?.sort_key ?? null;
  }

  let newSort: number;
  if (prevSort != null && nextSort != null) newSort = (prevSort + nextSort) / 2;
  else if (prevSort != null) newSort = prevSort + BASE_STEP;
  else if (nextSort != null) newSort = nextSort - BASE_STEP / 2;
  else newSort = BASE_STEP / 2;

  await query(
    `INSERT INTO unified_custom_columns (key, sort_key, created_by) VALUES ($1, $2::numeric, $3)`,
    [name, newSort, user.username]
  );

  return NextResponse.json({ ok: true, key: name, sort_key: newSort });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const key = String(body?.key ?? "").trim();

  if (!key) return NextResponse.json({ error: "INVALID_KEY" }, { status: 400 });

  // 기본 컬럼 삭제 금지
  if ((unifiedColumns as unknown as string[]).includes(key)) {
    return NextResponse.json({ error: "CANNOT_DELETE_BASE_COLUMN" }, { status: 400 });
  }

  // 삭제(존재하지 않아도 ok 처리)
  await query(`DELETE FROM unified_custom_columns WHERE key=$1`, [key]);

  return NextResponse.json({ ok: true });
}