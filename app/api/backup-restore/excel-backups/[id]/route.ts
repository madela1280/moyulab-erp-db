import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXCEL_BACKUP_DIR =
  process.env.EXCEL_BACKUP_DIR || "/home/ubuntu/erp-backups/excel";

type SessionUser = {
  username: string;
  role?: string;
  name?: string;
  phone?: string;
};

async function requireUser() {
  const me = (await getSessionUser()) as SessionUser | null;
  if (!me) return null;

  return me;
}

function isSafeExcelBackupPath(filePath: string) {
  const backupRoot = path.resolve(EXCEL_BACKUP_DIR);
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
 * DELETE /api/backup-restore/excel-backups/[id]
 * 선택한 엑셀백업 삭제
 * - 서버 .xlsx 파일 삭제
 * - DB 메타정보 삭제
 */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const me = await requireUser();
    if (!me) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
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
      SELECT id, file_path, status
      FROM excel_backups
      WHERE id = $1
        AND backup_scope = 'unified_excel'
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

    const row = r.rows[0];
    const filePath = String(row.file_path || "");
    const status = String(row.status || "");

    if (status === "running") {
      return NextResponse.json(
        { ok: false, error: "backup_running" },
        { status: 400 }
      );
    }

    if (!filePath || !isSafeExcelBackupPath(filePath)) {
      return NextResponse.json(
        { ok: false, error: "unsafe_backup_path" },
        { status: 400 }
      );
    }

    await deleteFileIfExists(filePath);

    await query(
      `
      DELETE FROM excel_backups
      WHERE id = $1
      `,
      [id]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/backup-restore/excel-backups/[id] error:", e);
    return NextResponse.json(
      { ok: false, error: "server" },
      { status: 500 }
    );
  }
}