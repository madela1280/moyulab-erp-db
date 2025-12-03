import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/permissions?username=...
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const username = url.searchParams.get("username");

    if (!username) {
      return NextResponse.json(
        { ok: false, error: "missing_username" },
        { status: 400 }
      );
    }

    const sql = `
      SELECT menu_key, can_read, can_write
      FROM permissions
      WHERE username = $1
    `;
    const r = await query(sql, [username]);

    // { [menu_key]: { can_read, can_write } } 형태로 돌려주기
    const map: Record<string, { can_read: boolean; can_write: boolean }> = {};
    for (const row of r.rows) {
      map[row.menu_key] = {
        can_read: !!row.can_read,
        can_write: !!row.can_write,
      };
    }

    return NextResponse.json({ ok: true, username, permissions: map });
  } catch (e) {
    console.error("GET /api/permissions error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

// POST /api/permissions
// body: { username, menu_key, can_read, can_write }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body.username || "").trim();
    const menu_key = String(body.menu_key || "").trim();
    const can_read = !!body.can_read;
    const can_write = !!body.can_write;

    if (!username || !menu_key) {
      return NextResponse.json(
        { ok: false, error: "missing_params" },
        { status: 400 }
      );
    }

    // 읽기/쓰기 모두 false면 행 삭제(권한 제거)
    if (!can_read && !can_write) {
      await query(
        `DELETE FROM permissions WHERE username = $1 AND menu_key = $2`,
        [username, menu_key]
      );
      return NextResponse.json({ ok: true, deleted: true });
    }

    // 아니면 upsert
    const sql = `
      INSERT INTO permissions (username, menu_key, can_read, can_write)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username, menu_key)
      DO UPDATE SET
        can_read = EXCLUDED.can_read,
        can_write = EXCLUDED.can_write
    `;
    await query(sql, [username, menu_key, can_read, can_write]);

    return NextResponse.json({ ok: true, deleted: false });
  } catch (e) {
    console.error("POST /api/permissions error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}