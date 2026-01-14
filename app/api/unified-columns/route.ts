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

function baseSortKeyOf(key: string): number | null {
  const idx = (unifiedColumns as unknown as string[]).indexOf(key);
  if (idx < 0) return null;
  return (idx + 1) * BASE_STEP;
}

async function getGlobalOrder(): Promise<Array<{ key: string; sort_key: number }>> {
  const base = (unifiedColumns as unknown as string[]).map((k, i) => ({
    key: k,
    sort_key: (i + 1) * BASE_STEP,
  }));

  const r = await query(
    `SELECT key, sort_key::numeric AS sort_key FROM unified_custom_columns ORDER BY sort_key ASC, key ASC`
  );

  const custom = r.rows.map((x: any) => ({
    key: String(x.key),
    sort_key: Number(x.sort_key),
  }));

  const combined = [...base, ...custom];

  // key 중복 방지(커스텀에 기본 키가 들어오면 기본 우선)
  const seen = new Set<string>();
  const dedup: Array<{ key: string; sort_key: number }> = [];
  for (const c of combined.sort((a, b) => a.sort_key - b.sort_key)) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    dedup.push(c);
  }

  return dedup.sort((a, b) => a.sort_key - b.sort_key);
}

export async function GET() {
  const order = await getGlobalOrder();
  return NextResponse.json({ order: order.map((x) => x.key) });
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

  if (!name) {
    return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json({ error: "NAME_TOO_LONG" }, { status: 400 });
  }

  // 기본 컬럼과 동일 이름 금지
  if ((unifiedColumns as unknown as string[]).includes(name)) {
    return NextResponse.json({ error: "DUPLICATE_WITH_BASE" }, { status: 409 });
  }

  // 기준 컬럼 유효성 검사(전역 목록 기준으로 존재해야 함)
  const global = await getGlobalOrder();
  const ref = global.find((x) => x.key === referenceKey);
  if (!ref) {
    return NextResponse.json({ error: "INVALID_REFERENCE_KEY" }, { status: 400 });
  }

  // 이미 존재하는 커스텀 컬럼 중복 방지
  const exists = await query(`SELECT 1 FROM unified_custom_columns WHERE key=$1`, [name]);
  if (exists.rows.length) {
    return NextResponse.json({ error: "DUPLICATE_CUSTOM_KEY" }, { status: 409 });
  }

  // 새 sort_key 계산(엑셀 열 삽입처럼 between)
  const sorted = global.sort((a, b) => a.sort_key - b.sort_key);
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
  if (prevSort != null && nextSort != null) {
    newSort = (prevSort + nextSort) / 2;
  } else if (prevSort != null && nextSort == null) {
    newSort = prevSort + BASE_STEP;
  } else if (prevSort == null && nextSort != null) {
    newSort = nextSort - BASE_STEP / 2;
  } else {
    // fallback (이론상 거의 없음)
    newSort = (baseSortKeyOf(referenceKey) ?? 0) + BASE_STEP / 2;
  }

  await query(
    `INSERT INTO unified_custom_columns (key, sort_key, created_by) VALUES ($1, $2::numeric, $3)`,
    [name, newSort, user.username]
  );

  return NextResponse.json({ ok: true, key: name, sort_key: newSort });
}