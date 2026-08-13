import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const DEFAULT_PATH_OPTIONS = [
  "기본",
  "보건소안내",
  "박스배너",
  "안내문",
  "직접요청",
  "기타",
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
    CREATE TABLE IF NOT EXISTS unified_path_options (
      id INTEGER PRIMARY KEY,
      options JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function ensureRowAndGet() {
  await ensureTable();

  const r = await query(`SELECT options FROM unified_path_options WHERE id = 1`);

  if (!r.rows.length) {
    const defaults = normalizeOptions(DEFAULT_PATH_OPTIONS);

    await query(
      `
      INSERT INTO unified_path_options (id, options)
      VALUES (1, $1::jsonb)
      ON CONFLICT (id) DO NOTHING
      `,
      [JSON.stringify(defaults)]
    );

    return { pathOptions: defaults };
  }

  const options = r.rows[0]?.options;
  return { pathOptions: normalizeOptions(options) };
}

async function saveOptions(list: string[]) {
  const merged = normalizeOptions(list);

  await ensureTable();

  await query(
    `
    INSERT INTO unified_path_options (id, options, updated_at)
    VALUES (1, $1::jsonb, now())
    ON CONFLICT (id)
    DO UPDATE SET
      options = EXCLUDED.options,
      updated_at = now()
    `,
    [JSON.stringify(merged)]
  );

  return { pathOptions: merged };
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
    console.error("GET /api/unified/path-options error:", e);
    return NextResponse.json({ error: "UNIFIED_PATH_OPTIONS_GET_FAILED" }, { status: 500 });
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

    if (Array.isArray((body as any).pathOptions)) {
      return NextResponse.json(await saveOptions((body as any).pathOptions));
    }

    const addName = normalizeName((body as any).add);
    const removeName = normalizeName((body as any).remove);

    const current = await ensureRowAndGet();
    let next = current.pathOptions.slice();

    if (addName) {
      next = Array.from(new Set([...next, addName]));
    } else if (removeName) {
      next = next.filter((x) => normalizeName(x) !== removeName);
    } else {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "pathOptions[] or add/remove is required" },
        { status: 400 }
      );
    }

    return NextResponse.json(await saveOptions(next));
  } catch (e) {
    console.error("PATCH /api/unified/path-options error:", e);
    return NextResponse.json({ error: "UNIFIED_PATH_OPTIONS_PATCH_FAILED" }, { status: 500 });
  }
}