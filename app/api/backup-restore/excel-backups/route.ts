import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { unifiedColumns } from "@/unified/columns/unifiedColumns";
import { countExtensionRounds } from "@/views/unified/extensions/extensionCompute";

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

type UnifiedRow = {
  id: number;
  data: Record<string, any> | null;
};

function sanitizeFilePart(v: string) {
  return v.replace(/[^0-9A-Za-z_-]/g, "_");
}

function makeExcelBackupFileName() {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  return `unified_excel_${sanitizeFilePart(stamp)}.xlsx`;
}

async function requireAdmin() {
  const me = (await getSessionUser()) as SessionUser | null;
  if (!me) return null;

  const role = String(me.role || "").trim().toLowerCase();
  if (role !== "admin") return null;

  return me;
}

async function ensureExcelBackupDir() {
  await fs.mkdir(EXCEL_BACKUP_DIR, { recursive: true });
}

async function getFileSizeBytes(filePath: string) {
  const st = await fs.stat(filePath);
  return st.size;
}

function isSafeExcelBackupPath(filePath: string) {
  const backupRoot = path.resolve(EXCEL_BACKUP_DIR);
  const targetPath = path.resolve(filePath);
  return targetPath.startsWith(backupRoot + path.sep);
}

async function backupFileExists(row: any) {
  const filePath = String(row?.file_path || "");

  if (!filePath || !isSafeExcelBackupPath(filePath)) {
    return false;
  }

  try {
    const st = await fs.stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

function isStaleRunningBackup(row: any) {
  if (String(row?.status || "") !== "running") {
    return false;
  }

  const startedAt = new Date(row?.started_at || row?.created_at || "");
  if (Number.isNaN(startedAt.getTime())) {
    return true;
  }

  const twoHoursMs = 1000 * 60 * 60 * 2;
  return Date.now() - startedAt.getTime() > twoHoursMs;
}

function toPublicBackup(row: any) {
  return {
    id: Number(row.id),
    backup_scope: row.backup_scope,
    file_name: row.file_name,
    file_size_bytes: Number(row.file_size_bytes || 0),
    status: row.status,
    error_message: row.error_message,
    row_count: Number(row.row_count || 0),
    created_by_username: row.created_by_username,
    created_by_name: row.created_by_name,
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
  };
}

function toExcelText(v: any) {
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

function buildHeader(rows: UnifiedRow[]) {
  const baseHeader: string[] = [...unifiedColumns];
  const extraKeySet = new Set<string>();

  for (const row of rows) {
    const data = (row.data ?? {}) as Record<string, any>;

    for (const key of Object.keys(data)) {
      if (key === "__type") continue;
      if (!baseHeader.includes(key)) {
        extraKeySet.add(key);
      }
    }
  }

  return [...baseHeader, ...Array.from(extraKeySet)];
}

async function loadUnifiedRowsForExcel(): Promise<UnifiedRow[]> {
  const r = await query(
    `
    SELECT u.id, u.data, o.sort_key
    FROM unified u
    LEFT JOIN unified_order o ON o.unified_id = u.id
    WHERE COALESCE(u.data->>'__type', '') <> 'signup_draft'
    ORDER BY o.sort_key ASC NULLS LAST, u.id ASC
    `
  );

  return r.rows as UnifiedRow[];
}

async function createUnifiedExcelFile(params: {
  filePath: string;
  rows: UnifiedRow[];
}) {
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
    width: Math.max(12, Math.min(30, key.length * 2 + 4)),
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
    const data = (row.data ?? {}) as Record<string, any>;
    const excelRow: Record<string, any> = {};

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

/**
 * GET /api/backup-restore/excel-backups
 * 엑셀백업 목록 조회
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
        backup_scope,
        file_name,
        file_path,
        file_size_bytes,
        status,
        error_message,
        row_count,
        created_by_username,
        created_by_name,
        started_at,
        finished_at,
        created_at
      FROM excel_backups
      WHERE backup_scope = 'unified_excel'
      ORDER BY created_at DESC, id DESC
      LIMIT 200
      `
    );

    const visibleBackups = [];

    for (const row of r.rows) {
      if (isStaleRunningBackup(row)) {
        continue;
      }

      const status = String(row.status || "");

      if (status !== "success") {
        continue;
      }

      const exists = await backupFileExists(row);
      if (!exists) {
        continue;
      }

      visibleBackups.push(toPublicBackup(row));
    }

    return NextResponse.json({
      ok: true,
      backups: visibleBackups,
      latestBackup: visibleBackups[0] || null,
    });
  } catch (e) {
    console.error("GET /api/backup-restore/excel-backups error:", e);
    return NextResponse.json(
      { ok: false, error: "server" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/backup-restore/excel-backups
 * 수동 통합관리 엑셀백업 생성
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
        $3,
        $4,
        NOW()
      )
      RETURNING id
      `,
      [fileName, filePath, me.username, me.name || ""]
    );

    backupId = Number(inserted.rows[0].id);

    const rows = await loadUnifiedRowsForExcel();

    await createUnifiedExcelFile({
      filePath,
      rows,
    });

    const fileSizeBytes = await getFileSizeBytes(filePath);

    const updated = await query(
      `
      UPDATE excel_backups
      SET
        status = 'success',
        file_size_bytes = $1,
        row_count = $2,
        finished_at = NOW(),
        error_message = NULL
      WHERE id = $3
      RETURNING
        id,
        backup_scope,
        file_name,
        file_size_bytes,
        status,
        error_message,
        row_count,
        created_by_username,
        created_by_name,
        started_at,
        finished_at,
        created_at
      `,
      [fileSizeBytes, rows.length, backupId]
    );

    return NextResponse.json({
      ok: true,
      backup: toPublicBackup(updated.rows[0]),
    });
  } catch (e: any) {
    console.error("POST /api/backup-restore/excel-backups error:", e);

    const message = e?.message || "excel_backup_failed";

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
        console.error("excel backup failed-status update error:", updateError);
      }
    }

    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch {
      }
    }

    return NextResponse.json(
      { ok: false, error: "excel_backup_failed" },
      { status: 500 }
    );
  }
}