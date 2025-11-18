import { NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db";
import { createToken } from "@/lib/auth";

type ReqBody = { username: string; password: string };
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReqBody;
    if (!body?.username || !body?.password) {
      return NextResponse.json({ ok: false, error: "missing" }, { status: 400 });
    }

    // 🟦 임시 관리자 계정 (DB 없이 로그인 허용)
    if (body.username === "medela1280" && body.password === "12345") {
      const token = createToken({
        username: "medela1280",
        role: "admin",
        name: "관리자",
        phone: "01000000000",
      });

      const res = NextResponse.json({
        ok: true,
        username: "medela1280",
        name: "관리자",
        role: "admin",
        phone: "01000000000",
      });

      res.cookies.set("token", token, {
        httpOnly: true,
        path: "/",
        sameSite: "none",
        secure: true,
        maxAge: 7 * 24 * 60 * 60,
      });

      return res;
    }

    const sql = `
      SELECT username, password_hash, salt, role, name, phone
      FROM users
      WHERE username = $1
      LIMIT 1
    `;
    const r = await query(sql, [body.username]);

    if (r.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 403 });
    }

    // ✅ 안전한 캐스팅
    const u = (r.rows[0] as unknown) as {
      username: string;
      password_hash: string;
      salt: string;
      role: string;
      name: string;
      phone: string;
    };

    const tryHash = sha256(`${u.salt}|${body.password}`);

    if (tryHash !== u.password_hash) {
      return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 403 });
    }

    const token = createToken({
      username: u.username,
      role: u.role,
      name: u.name,
      phone: u.phone,
    });

    const res = NextResponse.json({
      ok: true,
      username: u.username,
      name: u.name,
      role: u.role,
      phone: u.phone,
    });

    res.cookies.set("token", token, {
      httpOnly: true,
      path: "/",
      sameSite: "none",
      secure: true,
      maxAge: 7 * 24 * 60 * 60,
    });

    return res;
  } catch (e) {
    console.error("login error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}




