import { NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db";
import { createToken } from "@/lib/auth";

type ReqBody = { username: string; password: string };
const sha256 = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReqBody;
    if (!body?.username || !body?.password) {
      return NextResponse.json(
        { ok: false, error: "missing" },
        { status: 400 }
      );
    }

    const sql = `
      SELECT username, password, password_hash, salt, role, name, phone
      FROM users
      WHERE username = $1
      LIMIT 1
    `;
    const r = await query(sql, [body.username.trim()]);

    if (r.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "invalid_user" },
        { status: 403 }
      );
    }

    const u = r.rows[0] as {
      username: string;
      password: string | null;
      password_hash: string | null;
      salt: string | null;
      role: string | null;
      name: string | null;
      phone: string | null;
    };

    const inputPw = body.password;

    let okPassword = false;

    // 1) 해시 + salt가 있으면 그걸 우선 사용
    if (u.password_hash && u.salt) {
      const tryHash = sha256(`${u.salt}|${inputPw}`);
      if (tryHash === u.password_hash) {
        okPassword = true;
      }
    } else if (u.password) {
      // 2) 아니면 password(평문) 컬럼으로 비교 (초기 단계용)
      if (u.password === inputPw) {
        okPassword = true;
      }
    }

    if (!okPassword) {
      return NextResponse.json(
        { ok: false, error: "invalid_password" },
        { status: 403 }
      );
    }

    // ✅ role/name/phone 정규화:
    // DB role 값이 "Admin", "admin "처럼 들어가도 항상 안정적으로 admin/user 판정
    const rawRole = String(u.role || "user").trim().toLowerCase();
    const role = rawRole === "admin" ? "admin" : "user";
    const name = String(u.name || "");
    const phone = String(u.phone || "");

    const token = createToken({
      username: u.username,
      role,
      name,
      phone,
    });

    const res = NextResponse.json({
      ok: true,
      username: u.username,
      name,
      role,
      phone,
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
    return NextResponse.json(
      { ok: false, error: "server" },
      { status: 500 }
    );
  }
}