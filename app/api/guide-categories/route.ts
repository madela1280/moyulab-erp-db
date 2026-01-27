// app/api/guide-categories/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

/**
 * 안내분류(guide categories) 목록 관리 API
 *
 * 필요 DB 테이블(1회 생성):
 *
 * CREATE TABLE IF NOT EXISTS guide_categories (
 *   name text PRIMARY KEY,
 *   sort_key numeric NOT NULL DEFAULT 0,
 *   created_by text,
 *   created_at timestamptz NOT NULL DEFAULT now()
 * );
 */

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

export async function GET() {
  // GET은 로그인 없이도 동작 가능(목록 조회)
  const r = await query(
    `
    SELECT name, sort_key::numeric AS sort_key, created_by, created_at
    FROM guide_categories
    ORDER BY sort_key ASC, name ASC
    `
  );

  return NextResponse.json({
    categories: (r.rows || []).map((x: any) => ({
      name: String(x.name ?? ""),
      sort_key: Number(x.sort_key ?? 0),
      created_by: x.created_by ?? null,
      created_at: x.created_at ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = normalizeName(body?.name);
  const sortKeyRaw = body?.sort_key;
  const sort_key = Number.isFinite(Number(sortKeyRaw)) ? Number(sortKeyRaw) : 0;

  if (!name) return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "NAME_TOO_LONG" }, { status: 400 });

  // 중복 방지
  const exists = await query(`SELECT 1 FROM guide_categories WHERE name=$1`, [name]);
  if (exists.rows.length) return NextResponse.json({ error: "DUPLICATE_NAME" }, { status: 409 });

  await query(
    `
    INSERT INTO guide_categories (name, sort_key, created_by)
    VALUES ($1, $2::numeric, $3)
    `,
    [name, sort_key, user.username]
  );

  return NextResponse.json({ ok: true, name, sort_key });
}

export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = normalizeName(body?.name);
  if (!name) return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });

  // 존재하지 않아도 ok 처리(멱등)
  await query(`DELETE FROM guide_categories WHERE name=$1`, [name]);

  return NextResponse.json({ ok: true });
}