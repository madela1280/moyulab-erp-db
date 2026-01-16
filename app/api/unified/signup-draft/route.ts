import { NextResponse } from "next/server";
import { Pool } from "pg";

type RowValues = Record<string, string>;

type DraftData = {
  __type: "signup_draft";
  rows: RowValues[];
  updated_at: string;
};

const pool =
  (globalThis as any).__signupDraftPool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

(globalThis as any).__signupDraftPool = pool;

function isPlainObject(v: any) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function normalizeRow(v: any): RowValues {
  if (!isPlainObject(v)) return {};
  const out: RowValues = {};
  for (const [k, val] of Object.entries(v)) out[String(k)] = String(val ?? "");
  return out;
}

function normalizeRows(input: any): RowValues[] {
  if (!Array.isArray(input)) return [];
  const rows = input.map(normalizeRow);
  // 안전장치(과도한 저장 방지)
  return rows.slice(0, 2000);
}

async function getDraftRow(client: any): Promise<{ id: number; data: DraftData } | null> {
  const { rows } = await client.query(
    `SELECT id, data
     FROM unified
     WHERE (data->>'__type') = 'signup_draft'
     ORDER BY id DESC
     LIMIT 1`
  );

  if (rows.length === 0) return null;

  const id = Number(rows[0].id);
  const data = rows[0].data as DraftData;

  if (!Number.isFinite(id) || !data || data.__type !== "signup_draft") return null;
  return { id, data };
}

export async function GET() {
  const client = await pool.connect();
  try {
    const found = await getDraftRow(client);
    if (!found) {
      return NextResponse.json({ id: null, rows: [] as RowValues[] });
    }
    return NextResponse.json({
      id: found.id,
      rows: Array.isArray(found.data?.rows) ? found.data.rows : [],
      updated_at: found.data?.updated_at ?? null,
    });
  } catch {
    return NextResponse.json({ error: "SIGNUP_DRAFT_GET_FAILED" }, { status: 500 });
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

    const rows = normalizeRows((body as any).rows);

    const nextData: DraftData = {
      __type: "signup_draft",
      rows,
      updated_at: new Date().toISOString(),
    };

    await client.query("BEGIN");

    const found = await getDraftRow(client);

    if (!found) {
      const ins = await client.query("INSERT INTO unified (data) VALUES ($1::jsonb) RETURNING id", [nextData]);
      const id = Number(ins.rows?.[0]?.id);
      await client.query("COMMIT");
      return NextResponse.json({ id: Number.isFinite(id) ? id : null, rows, updated_at: nextData.updated_at });
    }

    await client.query("UPDATE unified SET data = $1::jsonb WHERE id = $2", [nextData, found.id]);

    await client.query("COMMIT");
    return NextResponse.json({ id: found.id, rows, updated_at: nextData.updated_at });
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return NextResponse.json({ error: "SIGNUP_DRAFT_PATCH_FAILED" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE() {
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM unified WHERE (data->>'__type') = 'signup_draft'");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "SIGNUP_DRAFT_DELETE_FAILED" }, { status: 500 });
  } finally {
    client.release();
  }
}