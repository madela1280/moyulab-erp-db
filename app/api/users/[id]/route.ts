import { NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "@/lib/db";

const sha256 = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");

function getId(req: Request) {
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const last = segments[segments.length - 1];
  const id = Number(last);
  if (!last || Number.isNaN(id)) return null;
  return id;
}

/** 단일 사용자 조회 (필요 시 사용, UI에서는 안 써도 됨) */
export async function GET(req: Request) {
  const id = getId(req);
  if (id === null) {
    return NextResponse.json(
      { ok: false, error: "invalid_id" },
      { status: 400 }
    );
  }

  try {
    const sql = `
      SELECT id, username, role, name, phone, created_at
      FROM users
      WHERE id = $1
    `;
    const r = await query(sql, [id]);

    if (!r.rows.length) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    console.error("GET /api/users/[id] error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

/** 사용자 정보 수정 (비밀번호/이름/연락처/권한) */
export async function PATCH(req: Request) {
  const id = getId(req);
  if (id === null) {
    return NextResponse.json(
      { ok: false, error: "invalid_id" },
      { status: 400 }
    );
  }

  try {
    const body = (await req.json()) as {
      password?: string;
      name?: string;
      phone?: string;
      role?: string;
    };

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    // 이름
    if (body.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push((body.name ?? "").trim());
    }

    // 연락처
    if (body.phone !== undefined) {
      fields.push(`phone = $${idx++}`);
      values.push((body.phone ?? "").trim());
    }

    // 권한(role) - 필요 시 사용, 현재 UI에서는 안 써도 됨
    if (body.role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push((body.role ?? "").trim() || "user");
    }

    // 비밀번호 변경
    if (body.password && body.password.trim()) {
      const password = body.password.trim();
      const salt = crypto.randomBytes(16).toString("hex");
      const password_hash = sha256(`${salt}|${password}`);

      fields.push(`password = $${idx++}`);
      values.push(password);
      fields.push(`salt = $${idx++}`);
      values.push(salt);
      fields.push(`password_hash = $${idx++}`);
      values.push(password_hash);
    }

    // 변경할 필드가 하나도 없으면, 현재 정보만 반환
    if (fields.length === 0) {
      const r = await query(
        `SELECT id, username, role, name, phone, created_at FROM users WHERE id=$1`,
        [id]
      );
      if (!r.rows.length) {
        return NextResponse.json(
          { ok: false, error: "not_found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true, user: r.rows[0] });
    }

    const sql = `
      UPDATE users
      SET ${fields.join(", ")}
      WHERE id = $${idx}
      RETURNING id, username, role, name, phone, created_at
    `;
    values.push(id);

    const r = await query(sql, values);

    if (!r.rows.length) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    console.error("PATCH /api/users/[id] error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

/** 사용자 삭제 */
export async function DELETE(req: Request) {
  const id = getId(req);
  if (id === null) {
    return NextResponse.json(
      { ok: false, error: "invalid_id" },
      { status: 400 }
    );
  }

  try {
    const r = await query(`DELETE FROM users WHERE id=$1 RETURNING id`, [id]);

    if (!r.rowCount) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/users/[id] error:", e);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}