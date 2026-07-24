import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import pg from "pg";

const execFileAsync = promisify(execFile);
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const BACKUP_DIR =
  process.env.REGULAR_BACKUP_DIR || "/home/ubuntu/erp-backups/regular";
const RETENTION_DAYS = 30;

if (!DATABASE_URL) {
  console.error("[regular-backup] missing DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

function sanitizeFilePart(v) {
  return String(v).replace(/[^0-9A-Za-z_-]/g, "_");
}

function makeBackupFileName() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  return `erp_postgres_full_${sanitizeFilePart(stamp)}.dump`;
}

function isSafeBackupPath(filePath) {
  const backupRoot = path.resolve(BACKUP_DIR);
  const targetPath = path.resolve(filePath);
  return targetPath.startsWith(backupRoot + path.sep);
}

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function getFileSizeBytes(filePath) {
  const st = await fs.stat(filePath);
  return st.size;
}

async function deleteFileIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (e) {
    if (e?.code === "ENOENT") return;
    throw e;
  }
}

async function cleanupOldBackups() {
  const oldBackups = await query(
    `
    SELECT id, file_name, file_path
    FROM regular_backups
    WHERE backup_kind = 'regular'
      AND backup_scope = 'postgres_full'
      AND created_at < NOW() - ($1::text || ' days')::interval
      AND status IN ('success', 'failed')
    ORDER BY created_at ASC, id ASC
    `,
    [String(RETENTION_DAYS)]
  );

  if (oldBackups.rows.length === 0) {
    console.log(`[regular-backup] cleanup none older than ${RETENTION_DAYS} days`);
    return;
  }

  console.log(
    `[regular-backup] cleanup start count=${oldBackups.rows.length} retentionDays=${RETENTION_DAYS}`
  );

  for (const row of oldBackups.rows) {
    const id = Number(row.id);
    const fileName = String(row.file_name || "");
    const filePath = String(row.file_path || "");

    try {
      if (filePath && isSafeBackupPath(filePath)) {
        await deleteFileIfExists(filePath);
      } else if (filePath) {
        console.error(
          `[regular-backup] cleanup skipped unsafe path id=${id} path=${filePath}`
        );
        continue;
      }

      await query(
        `
        DELETE FROM regular_backups
        WHERE id = $1
        `,
        [id]
      );

      console.log(`[regular-backup] cleanup deleted id=${id} file=${fileName}`);
    } catch (e) {
      console.error(
        `[regular-backup] cleanup failed id=${id} file=${fileName}:`,
        e?.message || e
      );
    }
  }

  console.log("[regular-backup] cleanup done");
}

async function main() {
  let backupId = null;
  let filePath = "";

  try {
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
        'system',
        '자동백업',
        NOW()
      )
      RETURNING id
      `,
      [fileName, filePath]
    );

    backupId = Number(inserted.rows[0].id);

    console.log(`[regular-backup] start id=${backupId} file=${filePath}`);

    await execFileAsync(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--exclude-table-data=locks",
        "--dbname",
        DATABASE_URL,
        "--file",
        filePath,
      ],
      {
        env: process.env,
        timeout: 1000 * 60 * 30,
      }
    );

    const fileSizeBytes = await getFileSizeBytes(filePath);

    await query(
      `
      UPDATE regular_backups
      SET
        status = 'success',
        file_size_bytes = $1,
        finished_at = NOW(),
        error_message = NULL
      WHERE id = $2
      `,
      [fileSizeBytes, backupId]
    );

    console.log(
      `[regular-backup] success id=${backupId} size=${fileSizeBytes}`
    );

    await cleanupOldBackups();
  } catch (e) {
    const message = e?.stderr || e?.message || "backup_failed";
    console.error("[regular-backup] failed:", message);

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
        console.error("[regular-backup] failed-status update error:", updateError);
      }
    }

    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch {
      }
    }

    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();