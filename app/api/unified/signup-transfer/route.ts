import { NextResponse } from "next/server";
import { Pool } from "pg";

type RowValues = Record<string, any>;

type CandidateRow = {
  rowIndex: number;
  data: Record<string, string>;
};

type TransferResult =
  | { rowIndex: number; ok: true; unifiedId: number }
  | { rowIndex: number; ok: false; reason: string; code: string };

const pool =
  (globalThis as any).__signupTransferPool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

(globalThis as any).__signupTransferPool = pool;

function isPlainObject(v: any) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeString(v: any) {
  return String(v ?? "").trim();
}

function hasAnyValue(data: Record<string, string>) {
  for (const v of Object.values(data)) {
    if (String(v ?? "").trim() !== "") return true;
  }
  return false;
}

function pickData(row: any, selectedKeys: string[]): Record<string, string> {
  const src = isPlainObject(row) ? (row as RowValues) : {};
  const out: Record<string, string> = {};
  for (const k of selectedKeys) out[k] = normalizeString(src[k]);
  return out;
}

const REQUIRED_KEYS = ["수취인명", "연락처1", "계약자주소", "기기번호", "거래처분류", "택배발송일", "시작일"] as const;

function validateRequired(data: Record<string, string>): string[] {
  const missing: string[] = [];
  for (const k of REQUIRED_KEYS) {
    if (!normalizeString(data[k])) missing.push(k);
  }
  return missing;
}

async function getCursor(client: any): Promise<{ sort_key: number; id: number }> {
  const scanLimit = 20000;

  const cursorR = await client.query(
    `
    WITH candidates AS (
      SELECT u.id, u.data, o.sort_key
      FROM unified u
      JOIN unified_order o ON o.unified_id = u.id
      ORDER BY o.sort_key DESC, u.id DESC
      LIMIT $1
    ),
    last_data AS (
      SELECT c.sort_key, c.id
      FROM candidates c
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_each_text(c.data) kv
        WHERE kv.value IS NOT NULL AND kv.value <> ''
      )
      ORDER BY c.sort_key DESC, c.id DESC
      LIMIT 1
    ),
    last_any AS (
      SELECT c.sort_key, c.id
      FROM candidates c
      ORDER BY c.sort_key DESC, c.id DESC
      LIMIT 1
    )
    SELECT
      COALESCE((SELECT sort_key FROM last_data), (SELECT sort_key FROM last_any), 0) AS sort_key,
      COALESCE((SELECT id FROM last_data), (SELECT id FROM last_any), 0) AS id
    `,
    [scanLimit]
  );

  const sort_key = Number(cursorR.rows[0]?.sort_key ?? 0);
  const id = Number(cursorR.rows[0]?.id ?? 0);
  return {
    sort_key: Number.isFinite(sort_key) ? sort_key : 0,
    id: Number.isFinite(id) ? id : 0,
  };
}

async function findNextEmptyRowAfter(
  client: any,
  cursorSortKey: number,
  cursorId: number
): Promise<{ id: number; sort_key: number } | null> {
  const emptyR = await client.query(
    `
    SELECT u.id, o.sort_key
    FROM unified u
    JOIN unified_order o ON o.unified_id = u.id
    WHERE (o.sort_key, u.id) > ($1::numeric, $2::int)
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_each_text(u.data) kv
        WHERE kv.value IS NOT NULL AND kv.value <> ''
      )
    ORDER BY o.sort_key ASC, u.id ASC
    LIMIT 1
    `,
    [cursorSortKey, cursorId]
  );

  if (!emptyR.rows.length) return null;

  const id = Number(emptyR.rows[0]?.id ?? 0);
  const sort_key = Number(emptyR.rows[0]?.sort_key ?? 0);
  if (!Number.isFinite(id) || !Number.isFinite(sort_key)) return null;
  return { id, sort_key };
}

async function createNewRowAtEnd(client: any): Promise<{ id: number; sort_key: number }> {
  const ins = await client.query(`INSERT INTO unified (data) VALUES ('{}'::jsonb) RETURNING id`);
  const id = Number(ins.rows[0]?.id ?? 0);
  if (!Number.isFinite(id) || id <= 0) throw new Error("FAILED_CREATE_UNIFIED_ROW");

  const maxR = await client.query(`SELECT COALESCE(MAX(sort_key), 0) AS max FROM unified_order`);
  const max = Number(maxR.rows[0]?.max ?? 0);
  const nextKey = (Number.isFinite(max) ? max : 0) + 1000;

  await client.query(
    `INSERT INTO unified_order (unified_id, sort_key)
     VALUES ($1, $2)
     ON CONFLICT (unified_id) DO NOTHING`,
    [id, nextKey]
  );

  return { id, sort_key: nextKey };
}

async function checkDeviceDuplicates(client: any, devices: string[]): Promise<Set<string>> {
  if (!devices.length) return new Set();

  const r = await client.query(
    `
    SELECT DISTINCT (u.data->>'기기번호') AS device
    FROM unified u
    WHERE (u.data->>'기기번호') = ANY($1::text[])
      AND COALESCE(u.data->>'반납완료일', '') = ''
    `,
    [devices]
  );

  const out = new Set<string>();
  for (const row of r.rows) {
    const d = normalizeString(row?.device);
    if (d) out.add(d);
  }
  return out;
}

async function checkRecipientPhoneDuplicates(
  client: any,
  pairs: Array<{ name: string; phone: string }>
): Promise<Set<string>> {
  const clean = pairs
    .map((p) => ({ name: normalizeString(p.name), phone: normalizeString(p.phone) }))
    .filter((p) => p.name && p.phone);

  if (!clean.length) return new Set();

  // VALUES ($1,$2),($3,$4)...
  const valuesSql: string[] = [];
  const params: any[] = [];
  for (let i = 0; i < clean.length; i++) {
    valuesSql.push(`($${i * 2 + 1}::text, $${i * 2 + 2}::text)`);
    params.push(clean[i].name, clean[i].phone);
  }

  const r = await client.query(
    `
    WITH input(name, phone) AS (
      VALUES ${valuesSql.join(",")}
    )
    SELECT DISTINCT u.data->>'수취인명' AS name, u.data->>'연락처1' AS phone
    FROM unified u
    WHERE COALESCE(u.data->>'반납완료일', '') = ''
      AND (u.data->>'수취인명', u.data->>'연락처1') IN (SELECT name, phone FROM input)
    `,
    params
  );

  const out = new Set<string>();
  for (const row of r.rows) {
    const key = `${normalizeString(row?.name)}|${normalizeString(row?.phone)}`;
    if (key !== "|") out.add(key);
  }
  return out;
}

export async function POST(req: Request) {
  const client = await pool.connect();
  try {
    const body = await req.json().catch(() => null);
    if (!isPlainObject(body)) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

    const rowsRaw = (body as any).rows;
    const selectedKeysRaw = (body as any).selectedKeys;
    const force = !!(body as any).force;
    const confirmDuplicates = !!(body as any).confirmDuplicates;

    const selectedKeys = Array.isArray(selectedKeysRaw) ? selectedKeysRaw.map(String).filter(Boolean) : [];
    const rows = Array.isArray(rowsRaw) ? (rowsRaw as any[]) : [];

    if (selectedKeys.length === 0) {
      return NextResponse.json({ error: "NO_SELECTED_KEYS" }, { status: 400 });
    }

    // 1) 후보 행 생성(원본 rowIndex 유지)
    const candidates: CandidateRow[] = rows
      .map((r, idx) => ({ rowIndex: idx, data: pickData(r, selectedKeys) }))
      .filter((x) => hasAnyValue(x.data));

    if (candidates.length === 0) {
      return NextResponse.json({ error: "NO_DATA" }, { status: 400 });
    }

    // 2) 필수 입력 검증(항상 적용: force여도 필수는 유지)
    const results: TransferResult[] = [];
    let hasHardFail = false;

    for (const c of candidates) {
      const missing = validateRequired(c.data);
      if (missing.length) {
        hasHardFail = true;
        results.push({
          rowIndex: c.rowIndex,
          ok: false,
          code: "REQUIRED_MISSING",
          reason: `필수입력사항 입력해주세요: ${missing.join(", ")}`,
        });
      }
    }

    if (hasHardFail) {
      return NextResponse.json({
        ok: false,
        anyFailed: true,
        anyConfirmNeeded: false,
        results,
      });
    }

    // 3) 중복 규칙(옵션)
    if (!force) {
      // 3-1) 중복출고(기기번호): 반납완료일이 비어있으면 무조건 실패
      const devices = Array.from(
        new Set(
          candidates
            .map((c) => normalizeString(c.data["기기번호"]))
            .filter(Boolean)
        )
      );

      const dupDevices = await checkDeviceDuplicates(client, devices);

      if (dupDevices.size) {
        for (const c of candidates) {
          const d = normalizeString(c.data["기기번호"]);
          if (d && dupDevices.has(d)) {
            results.push({
              rowIndex: c.rowIndex,
              ok: false,
              code: "DUP_DEVICE_ACTIVE",
              reason: "중복출고(동일기기대여중)",
            });
          }
        }
      }

      // 3-2) 추가출고 확인(수취인명+연락처1): 반납완료일 비어있으면 confirm 필요
      const pairs = candidates.map((c) => ({
        name: normalizeString(c.data["수취인명"]),
        phone: normalizeString(c.data["연락처1"]),
      }));

      const dupPairs = await checkRecipientPhoneDuplicates(client, pairs);

      const confirmNeededRows: number[] = [];
      if (dupPairs.size) {
        for (const c of candidates) {
          const key = `${normalizeString(c.data["수취인명"])}|${normalizeString(c.data["연락처1"])}`;
          if (dupPairs.has(key)) {
            confirmNeededRows.push(c.rowIndex);
          }
        }
      }

      // 중복출고 실패가 있으면 즉시 실패 반환(확인 이전)
      if (results.length) {
        return NextResponse.json({
          ok: false,
          anyFailed: true,
          anyConfirmNeeded: false,
          results,
        });
      }

      // confirm이 필요하고, 아직 confirmDuplicates가 아니면 confirmNeeded 반환
      if (confirmNeededRows.length && !confirmDuplicates) {
        for (const idx of confirmNeededRows) {
          results.push({
            rowIndex: idx,
            ok: false,
            code: "NEED_CONFIRM_DUP_RECIPIENT",
            reason: "출고된 유축기가 있습니다. 추가 출고 하시겠습니까?",
          });
        }

        return NextResponse.json({
          ok: false,
          anyFailed: true,
          anyConfirmNeeded: true,
          confirmNeededRows,
          results,
        });
      }
    }

    // 4) 실제 전송(트랜잭션)
    await client.query("BEGIN");

    let cursor = await getCursor(client);

    const successResults: TransferResult[] = [];

    for (const c of candidates) {
      // 다음 빈 행 찾기
      let target = await findNextEmptyRowAfter(client, cursor.sort_key, cursor.id);

      // 없으면 새 행 생성(맨 끝)
      if (!target) {
        const created = await createNewRowAtEnd(client);
        target = created;
      }

      // merge 저장(JSONB)
      const upd = await client.query(`UPDATE unified SET data = data || $1::jsonb WHERE id = $2 RETURNING id`, [
        JSON.stringify(c.data),
        target.id,
      ]);

      const unifiedId = Number(upd.rows[0]?.id ?? target.id);

      successResults.push({
        rowIndex: c.rowIndex,
        ok: true,
        unifiedId: Number.isFinite(unifiedId) ? unifiedId : target.id,
      });

      // 커서 갱신(다음 저장 위치가 뒤로 가도록)
      cursor = { sort_key: target.sort_key, id: target.id };
    }

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      anyFailed: false,
      anyConfirmNeeded: false,
      insertedCount: successResults.length,
      results: successResults,
    });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return NextResponse.json(
      { error: "SIGNUP_TRANSFER_FAILED", message: String(e?.message || "") },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}