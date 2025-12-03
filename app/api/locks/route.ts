// app/api/locks/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth";
import { query } from "@/lib/db";

const LOCK_TTL_MINUTES = 5;

type UserInfo = {
  username: string;
  name: string;
};

async function getCurrentUser(): Promise<UserInfo | null> {
  try {
    // auth/me 와 동일한 방식으로 쿠키에서 토큰 꺼내기
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;
    if (!token) return null;

    const decoded = verifyToken(token);
    if (!decoded || typeof decoded !== "object") return null;

    const d = decoded as any;
    if (!d.username || !d.name) return null;

    return { username: d.username, name: d.name };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const action = body.action as "acquire" | "release" | "status";
    const resourceType = String(body.resource_type || "");
    const resourceIdNum = Number(body.resource_id);

    if (!action || !resourceType || !Number.isFinite(resourceIdNum)) {
      return NextResponse.json(
        { ok: false, error: "invalid_params" },
        { status: 400 }
      );
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + LOCK_TTL_MINUTES * 60 * 1000
    ).toISOString();

    if (action === "acquire") {
      // 현재 락 조회
      const existing = await query(
        `SELECT resource_type, resource_id, locked_by_username, locked_by_name, locked_at, expires_at
         FROM locks
         WHERE resource_type = $1 AND resource_id = $2`,
        [resourceType, resourceIdNum]
      );

      if (existing.rows.length === 0) {
        // 새로 락 생성
        const r = await query(
          `INSERT INTO locks
             (resource_type, resource_id, locked_by_username, locked_by_name, locked_at, expires_at)
           VALUES ($1, $2, $3, $4, NOW(), $5)
           RETURNING resource_type, resource_id, locked_by_username, locked_by_name, locked_at, expires_at`,
          [resourceType, resourceIdNum, user.username, user.name, expiresAt]
        );

        return NextResponse.json({ ok: true, lock: r.rows[0] });
      }

      const lock = existing.rows[0];
      const expired = new Date(lock.expires_at) < now;

      if (expired || lock.locked_by_username === user.username) {
        // 만료됐거나, 이미 내가 가진 락이면 갱신
        const r = await query(
          `UPDATE locks
             SET locked_by_username = $3,
                 locked_by_name = $4,
                 locked_at = NOW(),
                 expires_at = $5
           WHERE resource_type = $1 AND resource_id = $2
           RETURNING resource_type, resource_id, locked_by_username, locked_by_name, locked_at, expires_at`,
          [resourceType, resourceIdNum, user.username, user.name, expiresAt]
        );

        return NextResponse.json({ ok: true, lock: r.rows[0] });
      }

      // 다른 사용자가 아직 유효하게 보유 중
      return NextResponse.json({
        ok: false,
        reason: "locked_by_other",
        lock,
      });
    }

    if (action === "release") {
      // 내가 가진 락만 해제
      await query(
        `DELETE FROM locks
         WHERE resource_type = $1
           AND resource_id = $2
           AND locked_by_username = $3`,
        [resourceType, resourceIdNum, user.username]
      );

      return NextResponse.json({ ok: true });
    }

    if (action === "status") {
      const existing = await query(
        `SELECT resource_type, resource_id, locked_by_username, locked_by_name, locked_at, expires_at
         FROM locks
         WHERE resource_type = $1 AND resource_id = $2`,
        [resourceType, resourceIdNum]
      );

      if (existing.rows.length === 0) {
        return NextResponse.json({ ok: true, locked: false });
      }

      const lock = existing.rows[0];
      const expired = new Date(lock.expires_at) < now;

      if (expired) {
        // 자동 정리
        await query(
          `DELETE FROM locks
           WHERE resource_type = $1 AND resource_id = $2`,
          [resourceType, resourceIdNum]
        );
        return NextResponse.json({ ok: true, locked: false });
      }

      return NextResponse.json({ ok: true, locked: true, lock });
    }

    return NextResponse.json(
      { ok: false, error: "unknown_action" },
      { status: 400 }
    );
  } catch (e) {
    console.error("locks API error:", e);
    return NextResponse.json(
      { ok: false, error: "server_error" },
      { status: 500 }
    );
  }
}