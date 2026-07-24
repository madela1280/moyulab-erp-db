import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKUP_DIR =
  process.env.REGULAR_BACKUP_DIR || "/home/ubuntu/erp-backups/regular";

type SessionUser = {
  username: string;
  role?: string;
  name?: string;
  phone?: string;
};

async function requireAdmin() {
  const me = (await getSessionUser()) as SessionUser | null;
  if (!me) return null;

  const role = String(me.role || "").trim().toLowerCase();
  if (role !== "admin") return null;

  return me;
}

function isSafeBackupPath(filePath: string) {
  const backupRoot = path.resolve(BACKUP_DIR);
  const targetPath = path.resolve(filePath);
  return targetPath.startsWith(backupRoot + path.sep);
}

async function deleteFileIfExists(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch (e: any) {
    if (e?.code === "ENOENT") return;
    throw e;
  }
}

/**
 * DELETE /api/backup-restore/regular-backups/[id]
 * 선택한 정기백업 삭제
 * - 서버 백업 파일 삭제
 * - DB 메타정보 삭제
 */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireAdmin();
    if (!me) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    const params = await context.params;
    const id = Number(params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { ok: false, error: "invalid_id" },
        { status: 400 }
      );
    }

    const r = await query(
      `
      SELECT id, file_path
      FROM regular_backups
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (r.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404 }
      );
    }

    const filePath = String(r.rows[0].file_path || "");

    if (!filePath || !isSafeBackupPath(filePath)) {
      return NextResponse.json(
        { ok: false, error: "unsafe_backup_path" },
        { status: 400 }
      );
    }

    await deleteFileIfExists(filePath);

    await query(
      `
      DELETE FROM regular_backups
      WHERE id = $1
      `,
      [id]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/backup-restore/regular-backups/[id] error:", e);
    return NextResponse.json(
      { ok: false, error: "server" },
      { status: 500 }
    );
  }
}