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

async function ensureRowAndGetSettings(client: any): Promise<SignupSettings> {
  const { rows } = await client.query("SELECT settings FROM signup_settings WHERE id = 1");
  if (rows.length === 0) {
    await client.query("INSERT INTO signup_settings (id, settings) VALUES (1, $1::jsonb)", [DEFAULT_SETTINGS]);
    return DEFAULT_SETTINGS;
  }

  const s = rows[0]?.settings ?? {};
  return {
    selectedKeys: Array.isArray(s?.selectedKeys) ? s.selectedKeys.map(String) : DEFAULT_SETTINGS.selectedKeys,
    colWidthSteps: s?.colWidthSteps && typeof s.colWidthSteps === "object" ? (s.colWidthSteps as Record<string, number>) : DEFAULT_SETTINGS.colWidthSteps,
    rowCount: Number.isFinite(Number(s?.rowCount)) ? Math.max(1, Math.floor(Number(s.rowCount))) : DEFAULT_SETTINGS.rowCount,
    partnerOptions: Array.isArray(s?.partnerOptions) ? s.partnerOptions.map(String) : DEFAULT_SETTINGS.partnerOptions,
  };
}

function isPlainObject(v: any) {
  return v && typeof v === "object" && !Array.isArray(v);
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

export async function GET() {
  const client = await pool.connect();
  try {
    const settings = await ensureRowAndGetSettings(client);
    return NextResponse.json(settings);
  } catch (e: any) {
    return new NextResponse(e?.message || "FAILED", { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(req: Request) {
  const client = await pool.connect();
  try {
    const body = await req.json().catch(() => ({}));
    if (!isPlainObject(body)) {
      return new NextResponse("INVALID_BODY", { status: 400 });
    }

    await client.query("BEGIN");

    const current = await ensureRowAndGetSettings(client);
    const merged = mergeSettings(current, body);

    await client.query("UPDATE signup_settings SET settings = $1::jsonb, updated_at = now() WHERE id = 1", [merged]);

    await client.query("COMMIT");
    return NextResponse.json(merged);
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return new NextResponse(e?.message || "FAILED", { status: 500 });
  } finally {
    client.release();
  }
}