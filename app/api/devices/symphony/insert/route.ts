import { NextResponse } from "next/server";
import { query } from "@/lib/db";

function toInt(v: any, def: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}

/**
 * POST /api/devices/symphony/insert
 * body: { count: number, beforeId: number|null, afterId: number|null }
 *
 * - beforeId/afterId 사이에 count개 삽입 (Excel 스타일)
 * - 둘 다 null이면 맨 뒤에 추가
 * - 반환: insertedRows [{id, sort_key}]
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const count = Math.max(1, Math.min(5000, toInt(body?.count, 1)));
  const beforeId = body?.beforeId == null ? null : toInt(body.beforeId, 0);
  const afterId = body?.afterId == null ? null : toInt(body.afterId, 0);

  // 기준 sort_key 계산
  let beforeKey: number | null = null;
  let afterKey: number | null = null;

  if (beforeId) {
    const r = await query(
      `SELECT sort_key::numeric AS sort_key FROM device_symphony_order WHERE symphony_id=$1`,
      [beforeId]
    );
    beforeKey = r.rows[0]?.sort_key != null ? Number(r.rows[0].sort_key) : null;
  }

  if (afterId) {
    const r = await query(
      `SELECT sort_key::numeric AS sort_key FROM device_symphony_order WHERE symphony_id=$1`,
      [afterId]
    );
    afterKey = r.rows[0]?.sort_key != null ? Number(r.rows[0].sort_key) : null;
  }

  // 둘 다 없으면 tail append
  if (beforeKey == null && afterKey == null) {
    const maxR = await query(
      `SELECT COALESCE(MAX(sort_key), 0)::numeric AS max FROM device_symphony_order`
    );
    const max = Number(maxR.rows[0]?.max ?? 0);

    const inserted: Array<{ id: number; sort_key: number }> = [];

    for (let i = 0; i < count; i++) {
      const created = await query(
        `INSERT INTO device_symphony (data) VALUES ($1) RETURNING id`,
        [{}]
      );
      const id = Number(created.rows[0]?.id);
      const sortKey = max + (i + 1) * 1000;

      await query(
        `INSERT INTO device_symphony_order (symphony_id, sort_key) VALUES ($1, $2)`,
        [id, sortKey]
      );

      inserted.push({ id, sort_key: sortKey });
    }

    return NextResponse.json({ ok: true, insertedRows: inserted });
  }

  // 한쪽만 있으면 범위를 만들어서 삽입
  if (beforeKey == null && afterKey != null) beforeKey = afterKey - 1000;
  if (afterKey == null && beforeKey != null) afterKey = beforeKey + 1000;

  const start = Number(beforeKey);
  const end = Number(afterKey);

  // count개를 균등 분할 (충분히 촘촘히)
  const step = (end - start) / (count + 1);

  const inserted: Array<{ id: number; sort_key: number }> = [];

  for (let i = 0; i < count; i++) {
    const created = await query(
      `INSERT INTO device_symphony (data) VALUES ($1) RETURNING id`,
      [{}]
    );
    const id = Number(created.rows[0]?.id);
    const sortKey = start + step * (i + 1);

    await query(
      `INSERT INTO device_symphony_order (symphony_id, sort_key) VALUES ($1, $2)`,
      [id, sortKey]
    );

    inserted.push({ id, sort_key: sortKey });
  }

  return NextResponse.json({ ok: true, insertedRows: inserted });
}