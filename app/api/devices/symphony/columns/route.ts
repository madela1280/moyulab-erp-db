import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { symphonyColumns } from "@/devices/symphony/columns/symphonyColumns";

async function ensureColumnsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_symphony_columns (
      id   INT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await query(`
    INSERT INTO device_symphony_columns (id, data)
    VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);
}

/**
 * ✅ 핵심 정책
 * - base(=symphonyColumns)는 항상 base 순서를 유지한다.
 * - 저장된 order에 있던 "커스텀 컬럼"만 base 사이에 최대한 유지한다.
 *
 * 예) base: ... 유축기 위치, 거래처, 대여자명, 폐기 ...
 * 저장된 order에 커스텀(수리이력6)이 "수리이력5 뒤"로 들어있다면 그대로 유지.
 * base 컬럼(거래처/대여자명)이 뒤로 밀려있어도 base 위치로 강제 복귀.
 */
function normalizeOrderFixedBase(userOrder: any, baseOrder: string[]) {
  const baseSet = new Set(baseOrder);

  const input = Array.isArray(userOrder) ? userOrder.map(String) : [];
  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (const k of input) {
    const key = String(k ?? "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(key);
  }

  // 저장된 order에서 "커스텀 컬럼"만 뽑아낸다
  const customInUserOrder = cleaned.filter((k) => !baseSet.has(k));

  // base를 기준으로 결과를 만들되, custom은 기존 상대 위치를 최대한 유지
  // 전략: userOrder를 순회하면서, base가 나오면 base는 무시(어차피 baseOrder로 고정),
  // custom이 나오면 "해당 시점에 가까운 base 위치"에 붙인다.
  const result: string[] = [];
  const customBuckets: Record<string, string[]> = {}; // baseKey -> custom[] (그 baseKey '바로 뒤'에 붙이기)

  // 기본: 모든 custom은 맨 뒤 버킷에
  customBuckets["__TAIL__"] = [];

  // userOrder를 돌면서 custom의 "붙일 기준 base"를 추정
  // - 가장 최근에 등장한 baseKey 뒤에 붙인다
  let lastBase: string | "__TAIL__" = "__TAIL__";
  for (const k of cleaned) {
    if (baseSet.has(k)) {
      lastBase = k;
      if (!customBuckets[lastBase]) customBuckets[lastBase] = [];
    } else {
      if (!customBuckets[lastBase]) customBuckets[lastBase] = [];
      customBuckets[lastBase].push(k);
    }
  }

  // baseOrder 순서대로: base + 그 base 뒤에 붙일 custom(중복 제거) 출력
  const customSeen = new Set<string>();
  for (const baseKey of baseOrder) {
    result.push(baseKey);

    const bucket = customBuckets[baseKey] ?? [];
    for (const c of bucket) {
      if (customSeen.has(c)) continue;
      customSeen.add(c);
      result.push(c);
    }
  }

  // base를 한 번도 못 만난 custom(=__TAIL__)도 마지막에 붙임
  for (const c of customBuckets["__TAIL__"] ?? []) {
    if (customSeen.has(c)) continue;
    customSeen.add(c);
    result.push(c);
  }

  // 그리고 혹시 누락된 custom이 있으면(방어) 맨 뒤에
  for (const c of customInUserOrder) {
    if (customSeen.has(c)) continue;
    customSeen.add(c);
    result.push(c);
  }

  return result;
}

async function saveOrder(order: string[]) {
  await query(
    `
    INSERT INTO device_symphony_columns (id, data)
    VALUES (1, $1)
    ON CONFLICT (id)
    DO UPDATE SET data = EXCLUDED.data
    `,
    [{ order }]
  );
}

async function loadOrder() {
  await ensureColumnsTable();

  const baseOrder = [...(symphonyColumns as unknown as string[])];

  const r = await query(`SELECT data FROM device_symphony_columns WHERE id=1 LIMIT 1`);
  const data = (r.rows[0]?.data ?? {}) as any;

  const order = normalizeOrderFixedBase(data?.order, baseOrder);

  // ✅ 매번 저장해서 base 위치가 깨져있던 DB order를 자동으로 정리(즉시 반영 안정화)
  await saveOrder(order);

  return order;
}

export async function GET() {
  try {
    const order = await loadOrder();
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    console.error("GET /api/devices/symphony/columns error:", e);
    return NextResponse.json({ ok: false, error: "SERVER" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const name = String(body?.name ?? "").trim();
    const referenceKey = String(body?.referenceKey ?? "").trim();
    const position = body?.position === "before" ? "before" : "after";

    if (!name) return NextResponse.json({ ok: false, error: "missing_name" }, { status: 400 });
    if (!referenceKey)
      return NextResponse.json({ ok: false, error: "missing_referenceKey" }, { status: 400 });

    const baseOrder = [...(symphonyColumns as unknown as string[])];
    const baseSet = new Set(baseOrder);

    const cur = await loadOrder();
    if (cur.includes(name)) {
      return NextResponse.json({ ok: false, error: "already_exists" }, { status: 409 });
    }

    const next = [...cur];

    // 기준컬럼 위치에 삽입
    const refIdx = next.indexOf(referenceKey);
    const insertAt = refIdx < 0 ? next.length : position === "before" ? refIdx : refIdx + 1;
    next.splice(insertAt, 0, name);

    // ✅ base는 항상 base 순서로 고정
    const normalized = normalizeOrderFixedBase(next, baseOrder);

    // base 컬럼 이름과 동일한 커스텀은 허용하지 않음(충돌 방지)
    if (baseSet.has(name)) {
      return NextResponse.json({ ok: false, error: "cannot_add_base_name" }, { status: 400 });
    }

    await saveOrder(normalized);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/devices/symphony/columns error:", e);
    return NextResponse.json({ ok: false, error: "SERVER" }, { status: 500 });
  }
}