import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const DEFAULT_DEVICE_STATUS_OPTIONS = [
  "정상",
  "재대여",
  "대체기기",
  "문제기기",
];

function isPlainObject(v: any) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function sortKorean(a: string, b: string) {
  return String(a).localeCompare(String(b), "ko");
}

function normalizeOptions(list: any): string[] {
  if (!Array.isArray(list)) return [];

  const merged = Array.from(
    new Set(
      list
        .map(normalizeName)
        .filter(Boolean)
    )
  );

  merged.sort(sortKorean);
  return merged;
}

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS unified_device_status_options (
      id INTEGER PRIMARY KEY,
      options JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function ensureRowAndGet() {
  await ensureTable();

  const r = await query(`SELECT options FROM unified_device_status_options WHERE id = 1`);

  if (!r.rows.length) {
    const defaults = normalizeOptions(DEFAULT_DEVICE_STATUS_OPTIONS);

    await query(
      `
      INSERT INTO unified_device_status_options (id, options)
      VALUES (1, $1::jsonb)
      ON CONFLICT (id) DO NOTHING
      `,
      [JSON.stringify(defaults)]
    );

    return { deviceStatusOptions: defaults };
  }

  const options = r.rows[0]?.options;
  return { deviceStatusOptions: normalizeOptions(options) };
}

async function saveOptions(list: string[]) {
  const merged = normalizeOptions(list);

  await ensureTable();

  await query(
    `
    INSERT INTO unified_device_status_options (id, options, updated_at)
    VALUES (1, $1::jsonb, now())
    ON CONFLICT (id)
    DO UPDATE SET
      options = EXCLUDED.options,
      updated_at = now()
    `,
    [JSON.stringify(merged)]
  );

  return { deviceStatusOptions: merged };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const row = await ensureRowAndGet();
    return NextResponse.json(row);
  } catch (e) {
    console.error("GET /api/unified/device-status-options error:", e);
    return NextResponse.json({ error: "UNIFIED_DEVICE_STATUS_OPTIONS_GET_FAILED" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    if (!isPlainObject(body)) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    if (Array.isArray((body as any).deviceStatusOptions)) {
      return NextResponse.json(await saveOptions((body as any).deviceStatusOptions));
    }

    const addName = normalizeName((body as any).add);
    const removeName = normalizeName((body as any).remove);

    const current = await ensureRowAndGet();
    let next = current.deviceStatusOptions.slice();

    if (addName) {
      next = Array.from(new Set([...next, addName]));
    } else if (removeName) {
      next = next.filter((x) => normalizeName(x) !== removeName);
    } else {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "deviceStatusOptions[] or add/remove is required" },
        { status: 400 }
      );
    }

    return NextResponse.json(await saveOptions(next));
  } catch (e) {
    console.error("PATCH /api/unified/device-status-options error:", e);
    return NextResponse.json({ error: "UNIFIED_DEVICE_STATUS_OPTIONS_PATCH_FAILED" }, { status: 500 });
  }
}