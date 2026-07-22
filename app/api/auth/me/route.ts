import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  try {
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

    const username = (decoded as any).username as string;

    // 항상 DB에서 사용자 정보 조회
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

    const dbUser = r.rows[0];

    // ✅ role/name/phone 정규화:
    // DB 값에 공백/대소문자 차이가 있어도 프론트에서는 항상 안정적으로 판정
    const normalizedRole = String(dbUser.role || "user").trim().toLowerCase();

    const user = {
      username: String(dbUser.username || "").trim(),
      role: normalizedRole === "admin" ? "admin" : "user",
      name: String(dbUser.name || ""),
      phone: String(dbUser.phone || ""),
    };

    return NextResponse.json({ ok: true, user }); 
  } catch (e) {
    console.error("❌ auth/me error:", e);
    return NextResponse.json(
      { ok: false, error: "invalid_token" },
      { status: 401 }
    );
  }
}
