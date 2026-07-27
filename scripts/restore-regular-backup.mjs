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

const RESTORE_REQUESTED_BY_USERNAME =
  process.env.RESTORE_REQUESTED_BY_USERNAME || "system";
const RESTORE_REQUESTED_BY_NAME =
  process.env.RESTORE_REQUESTED_BY_NAME || "복원";

const RESTORE_REASON =
  process.env.RESTORE_REASON || "";

const RESTORE_TARGET_BACKUP_ID = Number(
  process.env.RESTORE_TARGET_BACKUP_ID || "0"
);
const RESTORE_TARGET_BACKUP_FILE_NAME =
  process.env.RESTORE_TARGET_BACKUP_FILE_NAME || "";

if (!DATABASE_URL) {
  console.error("[restore-regular-backup] missing DATABASE_URL");
  process.exit(1);
}

function getArgValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return "";
  return process.argv[idx + 1] || "";
}

const BACKUP_ID = Number(getArgValue("--backup-id"));

if (!Number.isFinite(BACKUP_ID) || BACKUP_ID <= 0) {
  console.error("[restore-regular-backup] invalid --backup-id");
  process.exit(1);
}

function parseDatabaseUrl(databaseUrl) {
  const u = new URL(databaseUrl);
  const dbName = u.pathname.replace(/^\//, "");

  if (!dbName) {
    throw new Error("database name missing");
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";

  return {
    dbName,
    adminDatabaseUrl: adminUrl.toString(),
  };
}

const { dbName, adminDatabaseUrl } = parseDatabaseUrl(DATABASE_URL);

const appPool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

const adminPool = new Pool({
  connectionString: adminDatabaseUrl,
  ssl: false,
});

function sanitizeFilePart(v) {
  return String(v).replace(/[^0-9A-Za-z_-]/g, "_");
}

function makeSafetyBackupFileName() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  return `erp_pre_restore_safety_${sanitizeFilePart(stamp)}.dump`;
}

function isSafeBackupPath(filePath) {
  const backupRoot = path.resolve(BACKUP_DIR);
  const targetPath = path.resolve(filePath);
  return targetPath.startsWith(backupRoot + path.sep);
}

async function query(pool, text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function ensureRestoreAuditColumns() {
  await query(
    appPool,
    `
    ALTER TABLE regular_backups
      ADD COLUMN IF NOT EXISTS restore_reason TEXT,
      ADD COLUMN IF NOT EXISTS restore_target_backup_id BIGINT,
      ADD COLUMN IF NOT EXISTS restore_target_file_name TEXT
    `,
    []
  );
}

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function getFileSizeBytes(filePath) {
  const st = await fs.stat(filePath);
  return st.size;
}

async function getTargetBackup() {
  const r = await query(
    appPool,
    `
    SELECT id, file_name, file_path, status
    FROM regular_backups
    WHERE id = $1
    LIMIT 1
    `,
    [BACKUP_ID]
  );

  if (r.rows.length === 0) {
    throw new Error("target backup not found");
  }

  const backup = r.rows[0];

  if (String(backup.status || "") !== "success") {
    throw new Error("target backup is not success");
  }

  const filePath = String(backup.file_path || "");

  if (!filePath || !isSafeBackupPath(filePath)) {
    throw new Error("unsafe target backup path");
  }

  const st = await fs.stat(filePath);
  if (!st.isFile()) {
    throw new Error("target backup is not file");
  }

  return {
    id: Number(backup.id),
    fileName: String(backup.file_name || ""),
    filePath,
  };
}

async function createSafetyBackup() {
  await ensureBackupDir();

  const fileName = makeSafetyBackupFileName();
  const filePath = path.join(BACKUP_DIR, fileName);

  const inserted = await query(
    appPool,
    `
      INSERT INTO regular_backups (
      backup_kind,
      backup_scope,
      file_name,
      file_path,
      status,
      created_by_username,
      created_by_name,
      restore_reason,
      restore_target_backup_id,
      restore_target_file_name,
      started_at
    )
    VALUES (
      'pre_restore',
      'postgres_full',
      $1,
      $2,
      'running',
      $3,
      $4,
      $5,
      $6,
      $7,
      NOW()
    )
    RETURNING id
    `,
    [
      fileName,
      filePath,
      RESTORE_REQUESTED_BY_USERNAME,
      RESTORE_REQUESTED_BY_NAME,
      RESTORE_REASON,
      Number.isFinite(RESTORE_TARGET_BACKUP_ID) && RESTORE_TARGET_BACKUP_ID > 0
        ? RESTORE_TARGET_BACKUP_ID
        : null,
      RESTORE_TARGET_BACKUP_FILE_NAME,
    ] 
  );

  const backupId = Number(inserted.rows[0].id);

  console.log(
    `[restore-regular-backup] safety backup start id=${backupId} file=${filePath}`
  );

  try {
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
      appPool,
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
      `[restore-regular-backup] safety backup success id=${backupId} size=${fileSizeBytes}`
    );

    return { backupId, fileName, filePath };
  } catch (e) {
    await query(
      appPool,
      `
      UPDATE regular_backups
      SET
        status = 'failed',
        error_message = $1,
        finished_at = NOW()
      WHERE id = $2
      `,
      [String(e?.stderr || e?.message || "safety backup failed").slice(0, 2000), backupId]
    );

    try {
      await fs.unlink(filePath);
    } catch {
    }

    throw e;
  }
}

async function closeAppPoolBeforeRestore() {
  await appPool.end().catch(() => {});
}

async function terminateTargetDatabaseConnections() {
  await query(
    adminPool,
    `
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = $1
      AND pid <> pg_backend_pid()
    `,
    [dbName]
  );
}

async function recreateTargetDatabase() {
  const safeDbName = dbName.replace(/"/g, '""');

  await query(adminPool, `DROP DATABASE IF EXISTS "${safeDbName}"`, []);
  await query(adminPool, `CREATE DATABASE "${safeDbName}"`, []);
}

async function restoreTargetDatabase(targetBackup) {
  console.log(
    `[restore-regular-backup] restore start backupId=${targetBackup.id} file=${targetBackup.filePath}`
  );

  await execFileAsync(
    "pg_restore",
    [
      "--no-owner",
      "--no-acl",
      "--dbname",
      DATABASE_URL,
      targetBackup.filePath,
    ],
    {
      env: process.env,
      timeout: 1000 * 60 * 60,
      maxBuffer: 1024 * 1024 * 20,
    }
  );

  console.log(
    `[restore-regular-backup] restore success backupId=${targetBackup.id}`
  );
}

async function reinsertSafetyBackupAfterRestore(safetyBackup) {
  if (!safetyBackup) return;

  const restoredPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: false,
  });

  try {
    await query(
      restoredPool,
      `
      ALTER TABLE regular_backups
        ADD COLUMN IF NOT EXISTS restore_reason TEXT,
        ADD COLUMN IF NOT EXISTS restore_target_backup_id BIGINT,
        ADD COLUMN IF NOT EXISTS restore_target_file_name TEXT
      `,
      []
    );

    const fileSizeBytes = await getFileSizeBytes(safetyBackup.filePath).catch(
      () => 0
    );

    await query(
      restoredPool,
      `
      INSERT INTO regular_backups (
        backup_kind,
        backup_scope,
        file_name,
        file_path,
        file_size_bytes,
        status,
        error_message,
        created_by_username,
        created_by_name,
        restore_reason,
        restore_target_backup_id,
        restore_target_file_name,
        started_at,
        finished_at,
        created_at
      )
      VALUES (
        'pre_restore',
        'postgres_full',
        $1,
        $2,
        $3,
        'success',
        NULL,
        $4,
        $5,
        $6,
        $7,
        $8,
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (file_name)
      DO UPDATE SET
        backup_kind = 'pre_restore',
        backup_scope = 'postgres_full',
        file_path = EXCLUDED.file_path,
        file_size_bytes = EXCLUDED.file_size_bytes,
        status = 'success',
        error_message = NULL,
        created_by_username = EXCLUDED.created_by_username,
        created_by_name = EXCLUDED.created_by_name,
        restore_reason = EXCLUDED.restore_reason,
        restore_target_backup_id = EXCLUDED.restore_target_backup_id,
        restore_target_file_name = EXCLUDED.restore_target_file_name,
        finished_at = NOW()
      `,
      [
        safetyBackup.fileName,
        safetyBackup.filePath,
        fileSizeBytes,
        RESTORE_REQUESTED_BY_USERNAME,
        RESTORE_REQUESTED_BY_NAME,
        RESTORE_REASON,
        Number.isFinite(RESTORE_TARGET_BACKUP_ID) &&
        RESTORE_TARGET_BACKUP_ID > 0
          ? RESTORE_TARGET_BACKUP_ID
          : null,
        RESTORE_TARGET_BACKUP_FILE_NAME,
      ]
    );

    console.log(
      `[restore-regular-backup] safety backup reinserted file=${safetyBackup.fileName}`
    );
  } finally {
    await restoredPool.end().catch(() => {});
  }
}

async function main() {
  let targetBackup = null;
  let safetyBackup = null;

  try {
    console.log(
      `[restore-regular-backup] requested backupId=${BACKUP_ID} by=${RESTORE_REQUESTED_BY_USERNAME} reason=${RESTORE_REASON || "-"} targetFile=${RESTORE_TARGET_BACKUP_FILE_NAME || "-"}`
    );

    await ensureRestoreAuditColumns();

    targetBackup = await getTargetBackup();

    safetyBackup = await createSafetyBackup();

    await closeAppPoolBeforeRestore();

    await terminateTargetDatabaseConnections();
    await recreateTargetDatabase();
    await restoreTargetDatabase(targetBackup);
    await reinsertSafetyBackupAfterRestore(safetyBackup);

    console.log("[restore-regular-backup] done");
  } catch (e) {
    console.error("[restore-regular-backup] failed:", e?.stderr || e?.message || e);
    process.exitCode = 1;
  } finally {
    await appPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
  }
}

main();