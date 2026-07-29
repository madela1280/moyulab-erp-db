import { NextResponse } from "next/server";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { Readable } from "stream";
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

function encodeDownloadFileName(fileName: string) {
  return encodeURIComponent(fileName).replace(/['()]/g, escape);
}

/**
 * GET /api/backup-restore/excel-backups/[id]/download
 * 선택한 통합관리 엑셀백업 .xlsx 파일 다운로드
 */
export async function GET(
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
      SELECT id, file_name, file_path, file_size_bytes, status
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

    const backup = r.rows[0];
    const fileName = String(backup.file_name || "");
    const filePath = String(backup.file_path || "");
    const status = String(backup.status || "");

    if (status !== "success") {
      return NextResponse.json(
        { ok: false, error: "backup_not_ready" },
        { status: 400 }
      );
    }

    if (!filePath || !isSafeExcelBackupPath(filePath)) {
      return NextResponse.json(
        { ok: false, error: "unsafe_backup_path" },
        { status: 400 }
      );
    }

    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        return NextResponse.json(
          { ok: false, error: "file_not_found" },
          { status: 404 }
        );
      }
      throw e;
    }

    if (!stat.isFile()) {
      return NextResponse.json(
        { ok: false, error: "not_file" },
        { status: 400 }
      );
    }

    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const safeFileName = fileName || `unified_excel_backup_${id}.xlsx`;
    const encodedName = encodeDownloadFileName(safeFileName);

    return new NextResponse(webStream, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(
      "GET /api/backup-restore/excel-backups/[id]/download error:",
      e
    );
    return NextResponse.json(
      { ok: false, error: "server" },
      { status: 500 }
    );
  }
}