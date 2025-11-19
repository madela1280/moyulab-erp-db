import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // 🔥 NEW: Next 15 권장 방식 — await NO, 직접 호출
    const cookieStore = cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json({ ok: false, error: "no_token" }, { status: 401 });
    }

    const decoded = verifyToken(token);

    if (!decoded || typeof decoded !== "object" || !("username" in decoded)) {
      return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
    }

    const username = (decoded as any).username;

    // 🟦 임시 관리자 계정 즉시 성공 처리
    if (username === "medela1280") {
      return NextResponse.json({
        ok: true,
        user: {
          username: "medela1280",
          role: "admin",
          name: "관리자",
          phone: "01000000000",
        },
      });
    }

    // 🟦 일반 사용자 DB 조회
    const sql = `
      SELECT username, role, name, phone
      FROM users
      WHERE username = $1
      LIMIT 1
    `;
    const r = await query(sql, [username]);

    if (r.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    console.error("auth/me error:", e);
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }
}










