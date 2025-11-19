import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  try {
    // 🔥 너의 Next.js 환경은 cookies()가 Promise 이므로 await 필요
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "no_token" },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);

    if (!decoded || typeof decoded !== "object" || !("username" in decoded)) {
      return NextResponse.json(
        { ok: false, error: "invalid_token" },
        { status: 401 }
      );
    }

    const username = (decoded as any).username;

    // 🟦 임시 관리자 계정은 DB 조회 없이 통과
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
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    console.error("❌ auth/me error:", e);
    return NextResponse.json(
      { ok: false, error: "invalid_token" },
      { status: 401 }
    );
  }
}
