import { NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db";

type NewUserBody = {
  username: string;
  password: string;
  name?: string;
  phone?: string;
  role?: string;
};

const sha256 = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");

/** 사용자 목록 조회 */
export async function GET() {
  try {
    const sql = `
      SELECT id, username, role, name, phone, created_at
      FROM users
      ORDER BY id ASC
    `;
    const r = await query(sql);
    return NextResponse.json({ ok: true, users: r.rows });
  } catch (e) {
    console.error("GET /api/users error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

/** 새 사용자 추가 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as NewUserBody;

    const username = body.username?.trim();
    const password = body.password?.trim();
    const name = body.name?.trim() || "";
    const phone = body.phone?.trim() || "";
    const role = body.role?.trim() || "user";

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: "missing_username_or_password" },
        { status: 400 }
      );
    }

    // salt + password_hash 생성
    const salt = crypto.randomBytes(16).toString("hex");
    const password_hash = sha256(`${salt}|${password}`);

    const sql = `
      INSERT INTO users (username, password, role, name, phone, salt, password_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, username, role, name, phone, created_at
    `;
    const r = await query(sql, [
      username,
      password, // 초기에는 평문도 함께 저장 (기존 로그인 로직과 호환)
      role,
      name,
      phone,
      salt,
      password_hash,
    ]);

    return NextResponse.json({ ok: true, user: r.rows[0] });
  } catch (e: any) {
    console.error("POST /api/users error:", e);

    // username UNIQUE 위반 처리
    if (e?.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "duplicate_username" },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}