import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";

const MASTER_USERNAME = "medela1280";

const sha256 = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");

// 현재 로그인 사용자가 마스터인지 확인
async function getMasterUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;

  const decoded = verifyToken(token);
  if (!decoded || typeof decoded !== "object" || !("username" in decoded)) {
    return null;
  }

  const username = (decoded as any).username as string;
  if (username !== MASTER_USERNAME) return null; // 마스터만 허용

  return { username };
}

// GET /api/admin  → 마스터 계정 정보 조회
export async function GET() {
  try {
    const me = await getMasterUser();
    if (!me) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    const sql = `
      SELECT username, name, phone
      FROM users
      WHERE username = $1
      LIMIT 1
    `;
    const r = await query(sql, [MASTER_USERNAME]);

    if (r.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    console.error("GET /api/admin error:", e);
    return NextResponse.json(
      { ok: false, error: "server" },
      { status: 500 }
    );
  }
}

// POST /api/admin  → 마스터 계정 정보 수정
// body: { name?, phone?, password? }
export async function POST(req: Request) {
  try {
    const me = await getMasterUser();
    if (!me) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const name = (body.name ?? "").toString().trim();
    const phone = (body.phone ?? "").toString().trim();
    const password = (body.password ?? "").toString().trim();

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name) {
      fields.push(`name = $${idx++}`);
      values.push(name);
    }
    if (phone) {
      fields.push(`phone = $${idx++}`);
      values.push(phone);
    }
    if (password) {
      const salt = crypto.randomBytes(16).toString("hex");
      const password_hash = sha256(`${salt}|${password}`);

      fields.push(`password = $${idx++}`);
      values.push(password);
      fields.push(`salt = $${idx++}`);
      values.push(salt);
      fields.push(`password_hash = $${idx++}`);
      values.push(password_hash);
    }

    if (fields.length === 0) {
      return NextResponse.json(
        { ok: false, error: "nothing_to_update" },
        { status: 400 }
      );
    }

    fields.push(`updated_at = NOW()`);

    const sql = `
      UPDATE users
      SET ${fields.join(", ")}
      WHERE username = $${idx}
      RETURNING username, name, phone
    `;
    values.push(MASTER_USERNAME);

    const r = await query(sql, values);

    if (r.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    console.error("POST /api/admin error:", e);
    return NextResponse.json(
      { ok: false, error: "server" },
      { status: 500 }
    );
  }
}