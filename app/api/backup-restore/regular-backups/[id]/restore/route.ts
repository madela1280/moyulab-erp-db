import { NextResponse } from "next/server";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

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

function getKstHour() {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return Number.isFinite(hour) ? hour : 0;
}

function isBusinessHourKst() {
  const hour = getKstHour();
  return hour >= 7 && hour < 20;
}

const sha256 = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");

async function verifyAdminPassword(username: string, password: string) {
  const inputPassword = String(password || "");

  if (!username || !inputPassword) {
    return false;
  }

  const r = await query(
    `
    SELECT username, role, password, salt, password_hash
    FROM users
    WHERE username = $1
    LIMIT 1
    `,
    [username]
  );

  if (r.rows.length === 0) {
    return false;
  }

  const user = r.rows[0];
  const role = String(user.role || "").trim().toLowerCase();

  if (role !== "admin") {
    return false;
  }

  const savedPassword = String(user.password || "");
  const salt = String(user.salt || "");
  const passwordHash = String(user.password_hash || "");

  if (salt && passwordHash) {
    const inputHash = sha256(`${salt}|${inputPassword}`);
    if (inputHash === passwordHash) {
      return true;
    }
  }

  if (savedPassword && savedPassword === inputPassword) {
    return true;
  }

  return false;
}

/**
 * POST /api/backup-restore/regular-backups/[id]/restore
 *
 * 기존 body:
 * {
 *   confirmText: "RESTORE:<file_name>",
 *   businessHourConfirm?: "업무시간 복원 동의"
 * }
 *
 * 신규 body:
 * {
 *   adminPassword: "관리자 비밀번호",
 *   restoreReason?: "복원 사유"
 * }
 */
export async function POST(
  req: Request,
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

    const body = (await req.json().catch(() => ({}))) as any;
    const confirmText = String(body?.confirmText || "").trim(); 
    const businessHourConfirm = String(body?.businessHourConfirm || "").trim();
    const adminPassword = String(body?.adminPassword || "");
    const restoreReason = String(body?.restoreReason || "").trim();

    const useAdminPasswordConfirm = adminPassword.length > 0;

    const r = await query(
      `
      SELECT id, file_name, file_path, status
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

    const backup = r.rows[0];
    const fileName = String(backup.file_name || "");
    const status = String(backup.status || "");

    if (status !== "success") {
      return NextResponse.json(
        { ok: false, error: "backup_not_ready" },
        { status: 400 }
      );
    }

    const requiredConfirmText = `RESTORE:${fileName}`;

    if (useAdminPasswordConfirm) {
      const passwordOk = await verifyAdminPassword(me.username, adminPassword);

      if (!passwordOk) {
        return NextResponse.json(
          { ok: false, error: "invalid_admin_password" },
          { status: 403 }
        );
      }
    } else {
      if (confirmText !== requiredConfirmText) {
        return NextResponse.json(
          {
            ok: false,
            error: "confirm_text_mismatch",
            requiredConfirmText,
          },
          { status: 400 }
        );
      }

      if (isBusinessHourKst() && businessHourConfirm !== "업무시간 복원 동의") {
        return NextResponse.json(
          {
            ok: false,
            error: "business_hour_confirm_required",
            requiredBusinessHourConfirm: "업무시간 복원 동의",
          },
          { status: 400 }
        );
      }
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      return NextResponse.json(
        { ok: false, error: "missing_database_url" },
        { status: 500 }
      );
    }

    const scriptPath = path.join(
      process.cwd(),
      "scripts",
      "restore-regular-backup.mjs"
    );

    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [scriptPath, "--backup-id", String(id)],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          RESTORE_REQUESTED_BY_USERNAME: me.username,
          RESTORE_REQUESTED_BY_NAME: me.name || "",
          RESTORE_REASON: restoreReason,
          RESTORE_TARGET_BACKUP_ID: String(id),
          RESTORE_TARGET_BACKUP_FILE_NAME: fileName,
        },
        timeout: 1000 * 60 * 60,
        maxBuffer: 1024 * 1024 * 10,
      }
    );

    return NextResponse.json({
      ok: true,
      restoredBackupId: id,
      stdout,
      stderr,
    });
  } catch (e: any) {
    console.error(
      "POST /api/backup-restore/regular-backups/[id]/restore error:",
      e
    );

    return NextResponse.json(
      {
        ok: false,
        error: "restore_failed",
        detail: String(e?.stderr || e?.message || "").slice(0, 2000),
      },
      { status: 500 }
    );
  }
}