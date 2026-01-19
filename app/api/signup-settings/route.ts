import { NextResponse } from "next/server";
import { Pool } from "pg";

type SignupSettings = {
  selectedKeys: string[];
  colWidthSteps: Record<string, number>;
  rowCount: number;
  partnerOptions: string[];
};

const DEFAULT_SETTINGS: SignupSettings = {
  selectedKeys: [],
  colWidthSteps: {},
  rowCount: 1,
  partnerOptions: [],
};

// NOTE: DB 접근은 app/api/** 에서만 (정책 준수)
const pool =
  (globalThis as any).__signupSettingsPool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

(globalThis as any).__signupSettingsPool = pool;

function isPlainObject(v: any) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function normalizeSettings(s: any): SignupSettings {
  const safe = s ?? {};
  return {
    selectedKeys: Array.isArray(safe?.selectedKeys) ? safe.selectedKeys.map(String) : DEFAULT_SETTINGS.selectedKeys,
    colWidthSteps:
      safe?.colWidthSteps && typeof safe.colWidthSteps === "object" && !Array.isArray(safe.colWidthSteps)
        ? (safe.colWidthSteps as Record<string, number>)
        : DEFAULT_SETTINGS.colWidthSteps,
    rowCount: Number.isFinite(Number(safe?.rowCount)) ? Math.max(1, Math.floor(Number(safe.rowCount))) : DEFAULT_SETTINGS.rowCount,
    partnerOptions: Array.isArray(safe?.partnerOptions) ? safe.partnerOptions.map(String) : DEFAULT_SETTINGS.partnerOptions,
  };
}

function mergeSettings(base: SignupSettings, patch: any): SignupSettings {
  const next: SignupSettings = { ...base };

  if ("selectedKeys" in patch) {
    next.selectedKeys = Array.isArray(patch.selectedKeys) ? patch.selectedKeys.map(String) : [];
  }
  if ("colWidthSteps" in patch) {
    next.colWidthSteps = isPlainObject(patch.colWidthSteps) ? (patch.colWidthSteps as Record<string, number>) : {};
  }
  if ("rowCount" in patch) {
    const n = Number(patch.rowCount);
    next.rowCount = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : base.rowCount;
  }
  if ("partnerOptions" in patch) {
    next.partnerOptions = Array.isArray(patch.partnerOptions) ? patch.partnerOptions.map(String) : [];
  }

  return next;
}

// 운영 DB에 테이블이 없어서 "relation does not exist"가 노출되는 문제 방지:
// API 내부에서 안전하게 테이블을 보장합니다(핵심 스키마(unified/locks 등) 변경 아님).
async function ensureTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS signup_settings (
      id INTEGER PRIMARY KEY,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function ensureRowAndGetSettings(client: any): Promise<SignupSettings> {
  await ensureTable(client);

  const { rows } = await client.query("SELECT settings FROM signup_settings WHERE id = 1");
  if (rows.length === 0) {
    await client.query(
      "INSERT INTO signup_settings (id, settings) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()",
      [JSON.stringify(DEFAULT_SETTINGS)]
    );
    return DEFAULT_SETTINGS;
  }

  return normalizeSettings(rows[0]?.settings);
}

export async function GET() {
  const client = await pool.connect();
  try {
    const settings = await ensureRowAndGetSettings(client);
    return NextResponse.json(settings);
  } catch {
    // 에러 원문(예: relation does not exist)을 그대로 노출하지 않음
    return NextResponse.json({ error: "SIGNUP_SETTINGS_GET_FAILED" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(req: Request) {
  const client = await pool.connect();
  try {
    const body = await req.json().catch(() => ({}));
    if (!isPlainObject(body)) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    await client.query("BEGIN");

    const current = await ensureRowAndGetSettings(client);
    const merged = mergeSettings(current, body);

    await client.query(
      "INSERT INTO signup_settings (id, settings) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()",
      [JSON.stringify(merged)]
    );

    await client.query("COMMIT");
    return NextResponse.json(merged);
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {}
    // 에러 원문 노출 금지
    return NextResponse.json({ error: "SIGNUP_SETTINGS_PATCH_FAILED" }, { status: 500 });
  } finally {
    client.release();
  }
}