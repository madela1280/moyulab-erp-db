import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function getId(req: Request) {
  const url = new URL(req.url);
  return url.pathname.split("/").pop();
}

function n(v: any) {
  return String(v ?? "").trim();
}

function getSystemNoFromData(data: Record<string, any>) {
  return n(
    data?.["시스템 기기번호"] ??
      data?.["시스템기기번호"] ??
      data?.["기기번호"] ??
      data?.["기기 번호"]
  );
}

// ✅ 심포니 저장값을 통합관리 파생 컬럼(기종/구매렌탈/에러횟수/제품)로 즉시 동기화
async function syncUnifiedDerivedBySystemNo(systemNoRaw: any, sourceData: Record<string, any>) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return;

  const patch = {
    기종: n(sourceData?.["기종"]) || null,
    "구매/렌탈": n(sourceData?.["구매/렌탈"]) || null,
    에러횟수: n(sourceData?.["에러횟수"]) || null,
    제품: n(sourceData?.["제품명"] ?? sourceData?.["제품"]) || null,
  };

  await query(
    `
    UPDATE unified
    SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb
    WHERE lower(trim(COALESCE(data->>'기기번호',''))) = $1
    `,
    [systemNo, JSON.stringify(patch)]
  );
}

async function clearUnifiedDerivedBySystemNo(systemNoRaw: any) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return;

  const patch = {
    기종: null,
    "구매/렌탈": null,
    에러횟수: null,
    제품: null,
  };

  await query(
    `
    UPDATE unified
    SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb
    WHERE lower(trim(COALESCE(data->>'기기번호',''))) = $1
    `,
    [systemNo, JSON.stringify(patch)]
  );
}

async function existsSymphonyBySystemNo(systemNoRaw: any) {
  const systemNo = n(systemNoRaw).toLowerCase();
  if (!systemNo) return false;

  const r = await query(
    `
    SELECT 1
    FROM device_symphony
    WHERE lower(trim(COALESCE(
      data->>'시스템 기기번호',
      data->>'시스템기기번호',
      data->>'기기번호',
      data->>'기기 번호',
      ''
    ))) = $1
    LIMIT 1
    `,
    [systemNo]
  );

  return !!r.rows.length;
}

// ✅ 테이블 미생성으로 500 나는 것 방지: 자동 생성(있으면 무시)
async function ensureSymphonyTables() {
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
}

export async function GET(req: Request) {
  try {
    await ensureSymphonyTables();

    const id = getId(req);
    const r = await query(`SELECT id, data FROM device_symphony WHERE id=$1`, [id]);

    if (!r.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(r.rows[0]);
  } catch (e) {
    console.error("GET /api/devices/symphony/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await ensureSymphonyTables();

    const id = getId(req);
    const body = await req.json().catch(() => ({}));

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    const beforeR = await query(`SELECT data FROM device_symphony WHERE id=$1`, [id]);
    if (!beforeR.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const beforeData = (beforeR.rows[0]?.data ?? {}) as Record<string, any>;
    const beforeSystemNo = getSystemNoFromData(beforeData).toLowerCase();

    // ✅ 파생 컬럼은 저장 차단
    const patch: Record<string, any> = { ...body };
    delete patch["수리횟수"];
    delete patch["거래처"];
    delete patch["대여자명"];

    // ✅ 원자적 jsonb merge (동시 저장 덮어쓰기 완화)
    const r = await query(
      `
      UPDATE device_symphony
      SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb
      WHERE id = $2
      RETURNING id, data
      `,
      [JSON.stringify(patch), id]
    );

    if (!r.rows.length) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const saved = r.rows[0];
    const afterData = (saved?.data ?? {}) as Record<string, any>;
    const afterSystemNo = getSystemNoFromData(afterData).toLowerCase();

    // 신규/현재 시스템기기번호 동기화
    if (afterSystemNo) {
      await syncUnifiedDerivedBySystemNo(afterSystemNo, afterData);
    }

    // 시스템기기번호 변경/삭제 시, 이전 번호가 더 이상 기기관리에 없으면 통합관리 파생값 초기화
    if (beforeSystemNo && beforeSystemNo !== afterSystemNo) {
      const stillExists = await existsSymphonyBySystemNo(beforeSystemNo);
      if (!stillExists) {
        await clearUnifiedDerivedBySystemNo(beforeSystemNo);
      }
    }

    return NextResponse.json(saved);
  } catch (e) {
    console.error("PATCH /api/devices/symphony/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await ensureSymphonyTables();

    const id = getId(req);
    await query(`DELETE FROM device_symphony WHERE id=$1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/devices/symphony/[id] error:", e);
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}