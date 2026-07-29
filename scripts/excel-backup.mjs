import fs from "fs/promises";
import path from "path";
import pg from "pg";
import ExcelJS from "exceljs";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const EXCEL_BACKUP_DIR =
  process.env.EXCEL_BACKUP_DIR || "/home/ubuntu/erp-backups/excel";
const RETENTION_DAYS = 30;

const unifiedColumns = [
  "거래처분류",
  "상태",
  "안내분류",
  "구매/렌탈",
  "기기번호",
  "기종",
  "에러횟수",
  "제품",
  "수취인명",
  "연락처1",
  "연락처2",
  "계약자주소",
  "택배발송일",
  "시작일",
  "종료일",
  "반납요청일",
  "반납완료일",
  "특이사항1",
  "특이사항2",
  "총연장횟수",
  "신청일",
  "0차연장",
  "1차연장",
  "2차연장",
  "3차연장",
  "4차연장",
  "5차연장",
];

if (!DATABASE_URL) {
  console.error("[excel-backup] missing DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

function sanitizeFilePart(v) {
  return String(v).replace(/[^0-9A-Za-z_-]/g, "_");
}

function makeExcelBackupFileName() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  return `unified_excel_${sanitizeFilePart(stamp)}.xlsx`;
}

function isSafeExcelBackupPath(filePath) {
  const backupRoot = path.resolve(EXCEL_BACKUP_DIR);
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

async function ensureExcelBackupDir() {
  await fs.mkdir(EXCEL_BACKUP_DIR, { recursive: true });
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

function toExcelText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";

  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function hasValue(v) {
  if (v == null) return false;
  return String(v).trim() !== "";
}

function countExtensionRounds(data) {
  let count = 0;

  for (let i = 1; i <= 7; i++) {
    if (hasValue(data?.[`${i}차연장`])) {
      count++;
    }
  }

  return count;
}

function buildHeader(rows) {
  const baseHeader = [...unifiedColumns];
  const extraKeySet = new Set();

  for (const row of rows) {
    const data = row?.data ?? {};

    for (const key of Object.keys(data)) {
      if (key === "__type") continue;
      if (!baseHeader.includes(key)) {
        extraKeySet.add(key);
      }
    }
  }

  return [...baseHeader, ...Array.from(extraKeySet)];
}

async function loadUnifiedRowsForExcel() {
  const r = await query(
    `
    SELECT u.id, u.data, o.sort_key
    FROM unified u
    LEFT JOIN unified_order o ON o.unified_id = u.id
    WHERE COALESCE(u.data->>'__type', '') <> 'signup_draft'
    ORDER BY o.sort_key ASC NULLS LAST, u.id ASC
    `
  );

  return r.rows;
}

async function createUnifiedExcelFile(params) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Moyulab ERP";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("통합관리", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const header = buildHeader(params.rows);

  worksheet.columns = header.map((key) => ({
    header: key,
    key,
    width: Math.max(12, Math.min(30, String(key).length * 2 + 4)),
  }));

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FF0F172A" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };
  headerRow.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };

  for (const row of params.rows) {
    const data = row?.data ?? {};
    const excelRow = {};

    for (const key of header) {
      if (key === "총연장횟수") {
        excelRow[key] = countExtensionRounds(data);
        continue;
      }

      if (key === "상태") {
        excelRow[key] = toExcelText(data?.[key] ?? "");
        continue;
      }

      excelRow[key] = toExcelText(data?.[key]);
    }

    worksheet.addRow(excelRow);
  }

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
      };
    });
  });

  worksheet.autoFilter = {
    from: {
      row: 1,
      column: 1,
    },
    to: {
      row: 1,
      column: Math.max(1, header.length),
    },
  };

  await workbook.xlsx.writeFile(params.filePath);
}

async function cleanupOldExcelBackups() {
  const oldBackups = await query(
    `
    SELECT id, file_name, file_path
    FROM excel_backups
    WHERE backup_scope = 'unified_excel'
      AND created_at < NOW() - ($1::text || ' days')::interval
      AND status IN ('success', 'failed')
    ORDER BY created_at ASC, id ASC
    `,
    [String(RETENTION_DAYS)]
  );

  if (oldBackups.rows.length === 0) {
    console.log(
      `[excel-backup] cleanup none older than ${RETENTION_DAYS} days`
    );
    return;
  }

  console.log(
    `[excel-backup] cleanup start count=${oldBackups.rows.length} retentionDays=${RETENTION_DAYS}`
  );

  for (const row of oldBackups.rows) {
    const id = Number(row.id);
    const fileName = String(row.file_name || "");
    const filePath = String(row.file_path || "");

    try {
      if (filePath && isSafeExcelBackupPath(filePath)) {
        await deleteFileIfExists(filePath);
      } else if (filePath) {
        console.error(
          `[excel-backup] cleanup skipped unsafe path id=${id} path=${filePath}`
        );
        continue;
      }

      await query(
        `
        DELETE FROM excel_backups
        WHERE id = $1
        `,
        [id]
      );

      console.log(`[excel-backup] cleanup deleted id=${id} file=${fileName}`);
    } catch (e) {
      console.error(
        `[excel-backup] cleanup failed id=${id} file=${fileName}:`,
        e?.message || e
      );
    }
  }

  console.log("[excel-backup] cleanup done");
}

async function main() {
  let backupId = null;
  let filePath = "";

  try {
    await ensureExcelBackupDir();

    const fileName = makeExcelBackupFileName();
    filePath = path.join(EXCEL_BACKUP_DIR, fileName);

    const inserted = await query(
      `
      INSERT INTO excel_backups (
        backup_scope,
        file_name,
        file_path,
        status,
        created_by_username,
        created_by_name,
        started_at
      )
      VALUES (
        'unified_excel',
        $1,
        $2,
        'running',
        'system',
        '자동생성',
        NOW()
      )
      RETURNING id
      `,
      [fileName, filePath]
    );

    backupId = Number(inserted.rows[0].id);

    console.log(`[excel-backup] start id=${backupId} file=${filePath}`);

    const rows = await loadUnifiedRowsForExcel();

    await createUnifiedExcelFile({
      filePath,
      rows,
    });

    const fileSizeBytes = await getFileSizeBytes(filePath);

    await query(
      `
      UPDATE excel_backups
      SET
        status = 'success',
        file_size_bytes = $1,
        row_count = $2,
        finished_at = NOW(),
        error_message = NULL
      WHERE id = $3
      `,
      [fileSizeBytes, rows.length, backupId]
    );

    console.log(
      `[excel-backup] success id=${backupId} rows=${rows.length} size=${fileSizeBytes}`
    );

    await cleanupOldExcelBackups();
  } catch (e) {
    const message = e?.message || "excel_backup_failed";
    console.error("[excel-backup] failed:", message);

    if (backupId) {
      try {
        await query(
          `
          UPDATE excel_backups
          SET
            status = 'failed',
            error_message = $1,
            finished_at = NOW()
          WHERE id = $2
          `,
          [String(message).slice(0, 2000), backupId]
        );
      } catch (updateError) {
        console.error("[excel-backup] failed-status update error:", updateError);
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