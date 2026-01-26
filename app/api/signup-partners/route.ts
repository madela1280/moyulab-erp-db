import { NextResponse } from "next/server";
import { query } from "@/lib/db";

type SignupPartnersRow = {
  partnerOptions: string[];
};

function isPlainObject(v: any) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function sortKorean(a: string, b: string) {
  return String(a).localeCompare(String(b), "ko");
}

// 신규가입 전용 거래처 목록 테이블 보장
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS signup_partners (
      id INTEGER PRIMARY KEY,
      partners JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function ensureRowAndGet(): Promise<SignupPartnersRow> {
  await ensureTable();

  const r = await query(`SELECT partners FROM signup_partners WHERE id = 1`);
  if (!r.rows.length) {
    await query(
      `INSERT INTO signup_partners (id, partners)
       VALUES (1, '[]'::jsonb)
       ON CONFLICT (id) DO NOTHING`
    );
    return { partnerOptions: [] };
  }

  const partners = r.rows[0]?.partners;
  const list = Array.isArray(partners) ? partners.map(String) : [];
  const merged = Array.from(new Set(list.map(normalizeName).filter(Boolean)));
  merged.sort(sortKorean);

  return { partnerOptions: merged };
}

async function save(list: string[]): Promise<SignupPartnersRow> {
  const merged = Array.from(new Set((list || []).map(normalizeName).filter(Boolean)));
  merged.sort(sortKorean);

  await ensureTable();

  await query(
    `INSERT INTO signup_partners (id, partners)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET partners = EXCLUDED.partners, updated_at = now()`,
    [JSON.stringify(merged)]
  );

  return { partnerOptions: merged };
}

export async function GET() {
  try {
    const row = await ensureRowAndGet();
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "SIGNUP_PARTNERS_GET_FAILED" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!isPlainObject(body)) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    // 1) 전체 교체
    if (Array.isArray((body as any).partnerOptions)) {
      return NextResponse.json(await save((body as any).partnerOptions));
    }

    // 2) 단건 추가/삭제
    const addName = normalizeName((body as any).add);
    const removeName = normalizeName((body as any).remove);

    const current = await ensureRowAndGet();
    let next = current.partnerOptions.slice();

    if (addName) {
      next = Array.from(new Set([...next, addName]));
    } else if (removeName) {
      next = next.filter((x) => normalizeName(x) !== removeName);
    } else {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "partnerOptions[] or add/remove is required" },
        { status: 400 }
      );
    }

    return NextResponse.json(await save(next));
  } catch {
    return NextResponse.json({ error: "SIGNUP_PARTNERS_PATCH_FAILED" }, { status: 500 });
  }
}