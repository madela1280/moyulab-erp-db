import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function toInt(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

// ✅ 심포니 테이블이 아직 DB에 없어서 500이 나는 경우를 막기 위해,
//    API 호출 시 안전하게 "필요 테이블을 자동 생성" (IF NOT EXISTS) + order 누락 보정
// ✅ (Perf) 요청마다 실행하지 않고, 같은 Node 프로세스에서는 1회만 실행
let _ensureSymphonyTablesPromise: Promise<void> | null = null;

async function ensureSymphonyTables() {
  if (_ensureSymphonyTablesPromise) return _ensureSymphonyTablesPromise;

  _ensureSymphonyTablesPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS device_symphony (
        id   SERIAL PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '{}'::jsonb
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS device_symphony_order (
        symphony_id INT PRIMARY KEY REFERENCES device_symphony(id) ON DELETE CASCADE,
        sort_key    NUMERIC NOT NULL
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_device_symphony_order_sort
      ON device_symphony_order(sort_key, symphony_id);
    `);

    // 기존 row가 있는데 order가 없는 경우(초기 세팅/수동 insert 등) 보정
    await query(`
      INSERT INTO device_symphony_order (symphony_id, sort_key)
      SELECT s.id, (ROW_NUMBER() OVER (ORDER BY s.id)) * 1000
      FROM device_symphony s
      WHERE NOT EXISTS (
        SELECT 1 FROM device_symphony_order o WHERE o.symphony_id = s.id
      );
    `);
  })().catch((e) => {
    // 실패 시 다음 요청에서 재시도 가능하게 초기화
    _ensureSymphonyTablesPromise = null;
    throw e;
  });

  return _ensureSymphonyTablesPromise;
}

export async function GET(req: Request) {
  try {
    await ensureSymphonyTables();

    const url = new URL(req.url);
    const sp = url.searchParams;

    // meta=count : 전체 개수만
    if ((sp.get("meta") || "").toLowerCase() === "count") {
      const r = await query(`SELECT COUNT(*)::int AS count FROM device_symphony_order`);
      return NextResponse.json({ count: Number(r.rows[0]?.count ?? 0) });
    }

    // ids=1,2,3 : 부분 갱신용
    const idsParam = sp.get("ids");
    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.floor(n));

      if (!ids.length) return NextResponse.json([]);

      const r = await query(
        `
        SELECT s.id, s.data, o.sort_key
        FROM device_symphony s
        JOIN device_symphony_order o ON o.symphony_id = s.id
        WHERE s.id = ANY($1::int[])
        ORDER BY o.sort_key ASC, s.id ASC
        `,
        [ids]
      );

      return NextResponse.json(r.rows);
    }

    const limitRaw = toInt(sp.get("limit"));
    const limit = limitRaw == null ? 500 : Math.max(1, Math.min(5000, limitRaw));

    const tailData = sp.get("tailData") === "1";
    const tail = sp.get("tail") === "1";

    // 파라미터 없이 호출되면 전체(호환/디버그용)
    const noParams = Array.from(sp.keys()).length === 0;
    if (noParams) {
      const r = await query(`
        SELECT s.id, s.data, o.sort_key
        FROM device_symphony s
        JOIN device_symphony_order o ON o.symphony_id = s.id
        ORDER BY o.sort_key ASC, s.id ASC
      `);
      return NextResponse.json(r.rows);
    }

    // 1) tailData=1 : 마지막 데이터 근처 로드
    // ✅ (Perf) 여기서 COUNT(*)는 비용이 크므로 기본 응답에서는 생략(필요 시 meta=count로 별도 호출)
    if (tailData || tail) {
      const r = await query(
        `
        SELECT * FROM (
          SELECT s.id, s.data, o.sort_key
          FROM device_symphony s
          JOIN device_symphony_order o ON o.symphony_id = s.id
          ORDER BY o.sort_key DESC, s.id DESC
          LIMIT $1
        ) t
        ORDER BY t.sort_key ASC, t.id ASC
        `,
        [limit]
      );

      const rows = r.rows;
      return NextResponse.json({
        rows,
        total: rows.length,
        baseIndex: 1,
      });
    }

    // 기본: limit만 주면 앞에서부터 limit개
    const r = await query(
      `
      WITH page AS (
        SELECT s.id, s.data, o.sort_key
        FROM device_symphony s
        JOIN device_symphony_order o ON o.symphony_id = s.id
        ORDER BY o.sort_key ASC, s.id ASC
        LIMIT $1
      )
      SELECT json_agg(page ORDER BY sort_key ASC, id ASC) AS rows_json
      FROM page
      `,
      [limit]
    );

    const rows = (r.rows[0]?.rows_json ?? []) as any[];
    return NextResponse.json({ rows, total: rows.length, baseIndex: 1 });
  } catch (e) {
    console.error("GET /api/devices/symphony error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await ensureSymphonyTables();

    const body = await req.json().catch(() => ({}));

    const r = await query(
      `INSERT INTO device_symphony (data) VALUES ($1) RETURNING id, data`,
      [body ?? {}]
    );
    const created = r.rows[0];

    const maxR = await query(
      `SELECT COALESCE(MAX(sort_key), 0) AS max FROM device_symphony_order`
    );
    const max = Number(maxR.rows[0]?.max ?? 0);
    const nextKey = max + 1000;

    await query(
      `
      INSERT INTO device_symphony_order (symphony_id, sort_key)
      VALUES ($1, $2)
      ON CONFLICT (symphony_id) DO NOTHING
      `,
      [created.id, nextKey]
    );

    return NextResponse.json(created);
  } catch (e) {
    console.error("POST /api/devices/symphony error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}