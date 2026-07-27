import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const BACKUP_DIR =
  process.env.REGULAR_BACKUP_DIR || "/home/ubuntu/erp-backups/regular";

type SessionUser = {
  username: string;
  role?: string;
  name?: string;
  phone?: string;
};

function sanitizeFilePart(v: string) {
  return v.replace(/[^0-9A-Za-z_-]/g, "_");
}

function makeBackupFileName() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  return `erp_postgres_full_${sanitizeFilePart(stamp)}.dump`;
}

async function requireAdmin() {
  const me = (await getSessionUser()) as SessionUser | null;
  if (!me) return null;

  const role = String(me.role || "").trim().toLowerCase();
  if (role !== "admin") return null;

  return me;
}

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function getFileSizeBytes(filePath: string) {
  const st = await fs.stat(filePath);
  return st.size;
}

/**
 * GET /api/backup-restore/regular-backups
 * 정기백업 목록 조회
 */
export async function GET() {
  try {
    const me = await requireAdmin();
    if (!me) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

      const r = await query(
      `
      SELECT
        id,
        backup_kind,
        backup_scope,
        file_name,
        file_size_bytes,
        status,
        error_message,
        created_by_username,
        created_by_name,
        started_at,
        finished_at,
        created_at
      FROM regular_backups
      ORDER BY created_at DESC, id DESC
      LIMIT 200
      `
    );

    const latestPreRestore =
      r.rows.find(
        (row: any) =>
          String(row.backup_kind || "") === "pre_restore" &&
          String(row.status || "") === "success"
      ) || null;

    return NextResponse.json({
      ok: true,
      backups: r.rows,
      latestPreRestore,
    }); 
  } catch (e) {
    console.error("GET /api/backup-restore/regular-backups error:", e);
    return NextResponse.json(
      { ok: false, error: "server" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/backup-restore/regular-backups
 * 수동 정기백업 실행
 */
export async function POST() {
  let backupId: number | null = null;
  let filePath = "";

  try {
    const me = await requireAdmin();
    if (!me) {
      return NextResponse.json(
        { ok: false, error: "forbidden" },
        { status: 403 }
      );
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        { ok: false, error: "missing_database_url" },
        { status: 500 }
      );
    }

    await ensureBackupDir();

    const fileName = makeBackupFileName();
    filePath = path.join(BACKUP_DIR, fileName);

    const inserted = await query(
      `
      INSERT INTO regular_backups (
        backup_kind,
        backup_scope,
        file_name,
        file_path,
        status,
        created_by_username,
        created_by_name,
        started_at
      )
      VALUES (
        'regular',
        'postgres_full',
        $1,
        $2,
        'running',
        $3,
        $4,
        NOW()
      )
      RETURNING id
      `,
      [fileName, filePath, me.username, me.name || ""]
    );

    backupId = Number(inserted.rows[0].id);

    await execFileAsync(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--exclude-table-data=locks",
        "--dbname",
        databaseUrl,
        "--file",
        filePath,
      ],
      {
        env: process.env,
        timeout: 1000 * 60 * 30,
      }
    );

    const fileSizeBytes = await getFileSizeBytes(filePath);

    const updated = await query(
      `
      UPDATE regular_backups
      SET
        status = 'success',
        file_size_bytes = $1,
        finished_at = NOW(),
        error_message = NULL
      WHERE id = $2
      RETURNING
        id,
        backup_kind,
        backup_scope,
        file_name,
        file_size_bytes,
        status,
        error_message,
        created_by_username,
        created_by_name,
        started_at,
        finished_at,
        created_at
      `,
      [fileSizeBytes, backupId]
    );

    return NextResponse.json({ ok: true, backup: updated.rows[0] });
  } catch (e: any) {
    console.error("POST /api/backup-restore/regular-backups error:", e);

    const message =
      e?.stderr || e?.message || "backup_failed";

    if (backupId) {
      try {
        await query(
          `
          UPDATE regular_backups
          SET
            status = 'failed',
            error_message = $1,
            finished_at = NOW()
          WHERE id = $2
          `,
          [String(message).slice(0, 2000), backupId]
        );
      } catch (updateError) {
        console.error("regular backup failed-status update error:", updateError);
      }
    }

    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch {
      }
    }

    return NextResponse.json(
      { ok: false, error: "backup_failed" },
      { status: 500 }
    );
  }
}