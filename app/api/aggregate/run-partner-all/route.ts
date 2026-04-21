import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";

type PriceKind = "rent" | "extend";

type Period = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

type CellValue = {
  출고: number;
  대여일수: number;
  금액: number;
};

type RawRow = {
  start_date: string;
  request_date: string;
  complete_date: string;
  end_date: string;
  partner_category: string;
  receiver_name: string;
  product_name: string;
  device_no: string;
  rent_kind: string;
};

type PartnerSettingInfo = {
  l1: string;
  l2: string;
};

type AggregateRowOut = {
  pumpModel: string;
  partnerCategory: string;
  values: Record<string, CellValue>;
  sum: CellValue;
};

const BUCKET_ORDER = ["보건소", "조리원", "온라인", "개인", "기타"] as const;
const PUMP_ORDER = ["심포니", "락티나", "스윙", "스윙맥시", "프리스타일", "시밀레", "각시밀"] as const;

function toISODateString(v: any) {
  return String(v ?? "").trim();
}

function parseDateFlexible(v: any): Date | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;

  const s = raw.replaceAll(".", "-").replaceAll("/", "-");

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return dt;
    return null;
  }

  m = s.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = 2000 + Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) return dt;
    return null;
  }

  return null;
}

function isNonEmptyText(v: any) {
  return String(v ?? "").trim().length > 0;
}

function isTextLike(v: any) {
  const raw = String(v ?? "").trim();
  if (!raw) return false;
  return parseDateFlexible(raw) === null;
}

function addDaysUTC(d: Date, days: number) {
  const dt = new Date(d.getTime());
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

function getServerTodayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function buildPeriods(start: Date, end: Date, granularity: string): Period[] {
  const periods: Period[] = [];

  if (granularity === "기간별") {
    periods.push({
      key: "period",
      label: "기간별",
      start: new Date(start.getTime()),
      end: new Date(end.getTime()),
    });
    return periods;
  }

  if (granularity === "일별") {
    let cur = new Date(start.getTime());
    while (cur.getTime() <= end.getTime()) {
      const y = cur.getUTCFullYear();
      const mo = cur.getUTCMonth() + 1;
      const d = cur.getUTCDate();
      periods.push({
        key: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        label: `${mo}/${d}`,
        start: new Date(cur.getTime()),
        end: new Date(cur.getTime()),
      });
      cur = addDaysUTC(cur, 1);
    }
    return periods;
  }

  if (granularity === "연별") {
    let y = start.getUTCFullYear();
    const endY = end.getUTCFullYear();
    while (y <= endY) {
      periods.push({
        key: String(y),
        label: `${y}년`,
        start: new Date(Date.UTC(y, 0, 1)),
        end: new Date(Date.UTC(y, 11, 31)),
      });
      y++;
    }
    return periods;
  }

  let cur = startOfMonthUTC(start);
  const endMonth = startOfMonthUTC(end);
  while (cur.getTime() <= endMonth.getTime()) {
    const y = cur.getUTCFullYear();
    const mo = cur.getUTCMonth() + 1;
    periods.push({
      key: `${y}-${String(mo).padStart(2, "0")}`,
      label: `${mo}월`,
      start: startOfMonthUTC(cur),
      end: endOfMonthUTC(cur),
    });
    cur = new Date(Date.UTC(y, mo, 1));
  }

  return periods;
}

function overlapDaysInclusive(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const s = aStart.getTime() > bStart.getTime() ? aStart : bStart;
  const e = aEnd.getTime() < bEnd.getTime() ? aEnd : bEnd;
  if (e.getTime() < s.getTime()) return 0;
  return Math.floor((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function normalizePumpModelName(name: string) {
  const s = String(name ?? "").trim();
  if (s.includes("심포니")) return "심포니";
  if (s.includes("락티나")) return "락티나";
  if (s.includes("스윙맥") || s.includes("스윙맥시") || s.includes("스윙맥스")) return "스윙맥시";
  if (s.includes("프리스타일")) return "프리스타일";
  if (s.includes("스윙")) return "스윙";
  if (s.includes("시밀래") || s.includes("시밀레")) return "시밀레";
  if (s.includes("각시밀")) return "각시밀";
  return s || "미지정";
}

function pumpOrderIndex(name: string) {
  const idx = PUMP_ORDER.indexOf(normalizePumpModelName(name) as (typeof PUMP_ORDER)[number]);
  return idx >= 0 ? idx : 999;
}

function shiftByMonthsUTC(d: Date, diff: number) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + diff, 1));
  const last = endOfMonthUTC(target).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last)));
}

function shiftPeriod(start: Date, end: Date, type: "전년동일기간" | "전월동일기간") {
  if (type === "전년동일기간") {
    return { start: shiftByMonthsUTC(start, -12), end: shiftByMonthsUTC(end, -12) };
  }
  return { start: shiftByMonthsUTC(start, -1), end: shiftByMonthsUTC(end, -1) };
}

function initCell(): CellValue {
  return { 출고: 0, 대여일수: 0, 금액: 0 };
}

function addCell(a: CellValue, b: CellValue) {
  a.출고 += Number(b?.출고 ?? 0);
  a.대여일수 += Number(b?.대여일수 ?? 0);
  a.금액 += Number(b?.금액 ?? 0);
}

function makeEmptyValues(periods: Period[]) {
  const out: Record<string, CellValue> = {};
  for (const p of periods) out[p.key] = initCell();
  return out;
}

async function loadAllRows(): Promise<RawRow[]> {
  const candidates = ["recovery1", "recovery2", "recovery_complete_1", "recovery_complete_2", "recovery_recovery1", "recovery_recovery2"];

  const existR = await query(
    `SELECT t.name
     FROM unnest($1::text[]) AS t(name)
     WHERE to_regclass('public.' || t.name) IS NOT NULL`,
    [candidates]
  );

  const existingTables = (existR.rows || []).map((x: any) => String(x?.name || "").trim()).filter(Boolean);
  const unionParts: string[] = [];

  unionParts.push(`
    SELECT
      u.data->>'시작일' AS start_date,
      u.data->>'반납요청일' AS request_date,
      u.data->>'반납완료일' AS complete_date,
      u.data->>'종료일' AS end_date,
      u.data->>'거래처분류' AS partner_category,
      u.data->>'수취인명' AS receiver_name,
      u.data->>'제품' AS product_name,
      u.data->>'기기번호' AS device_no,
      COALESCE(NULLIF(u.data->>'구매/렌탈',''), u.data->>'대여형태') AS rent_kind
    FROM unified u
  `);

  for (const t of existingTables) {
    unionParts.push(`
      SELECT
        x.data->>'시작일' AS start_date,
        x.data->>'반납요청일' AS request_date,
        x.data->>'반납완료일' AS complete_date,
        x.data->>'종료일' AS end_date,
        x.data->>'거래처분류' AS partner_category,
        x.data->>'수취인명' AS receiver_name,
        x.data->>'제품' AS product_name,
        x.data->>'기기번호' AS device_no,
        COALESCE(NULLIF(x.data->>'구매/렌탈',''), x.data->>'대여형태') AS rent_kind
      FROM ${t} x
    `);
  }

  const r = await query(`${unionParts.join("\nUNION ALL\n")}`);
  return (r.rows || []).map((x: any) => ({
    start_date: String(x.start_date ?? "").trim(),
    request_date: String(x.request_date ?? "").trim(),
    complete_date: String(x.complete_date ?? "").trim(),
    end_date: String(x.end_date ?? "").trim(),
    partner_category: String(x.partner_category ?? "").trim(),
    receiver_name: String(x.receiver_name ?? "").trim(),
    product_name: String(x.product_name ?? "").trim(),
    device_no: String(x.device_no ?? "").trim(),
    rent_kind: String(x.rent_kind ?? "").trim(),
  }));
}

async function loadPartnerSettingsMap() {
  const r = await query(
    `SELECT
       s.partner_name,
       c1.name AS l1_name,
       c2.name AS l2_name
     FROM agg_partner_settings s
     LEFT JOIN agg_partner_categories c1 ON c1.id = s.partner_cat_l1_id
     LEFT JOIN agg_partner_categories c2 ON c2.id = s.partner_cat_l2_id`
  );

  const map = new Map<string, PartnerSettingInfo>();
  for (const row of r.rows || []) {
    const name = String(row.partner_name ?? "").trim();
    if (!name) continue;
    map.set(name, {
      l1: String(row.l1_name ?? "").trim(),
      l2: String(row.l2_name ?? "").trim(),
    });
  }
  return map;
}

async function loadPumpPriceMap() {
  const r = await query(
    `SELECT p.partner_name, m.name AS pump_model_name, p.kind, pr.amount
     FROM agg_partner_pump_prices p
     JOIN agg_pump_models m ON m.id = p.pump_model_id
     JOIN agg_prices pr ON pr.id = p.price_id`
  );

  const map = new Map<string, Map<string, { rent: number; extend: number }>>();

  function partnerKeys(raw: string) {
    const s = String(raw ?? "").trim();
    const keys = new Set<string>();
    if (s) keys.add(s);

    if (s.endsWith("구") || s.endsWith("시") || s.endsWith("군")) {
      keys.add("보건소");
      const head = s.slice(0, -1).trim();
      if (head) keys.add(head);
    }

    return Array.from(keys);
  }

  for (const row of r.rows || []) {
    const partnerRaw = String(row.partner_name ?? "").trim();
    const pumpRaw = String(row.pump_model_name ?? "").trim();
    const pump = normalizePumpModelName(pumpRaw);
    const kind = String(row.kind ?? "") as PriceKind;
    const amount = Number(row.amount ?? 0);

    if (!partnerRaw || !pump) continue;

    for (const partner of partnerKeys(partnerRaw)) {
      if (!map.has(partner)) map.set(partner, new Map());
      const pumpMap = map.get(partner)!;
      if (!pumpMap.has(pump)) pumpMap.set(pump, { rent: 0, extend: 0 });

      const priceObj = pumpMap.get(pump)!;
      if (kind === "rent") priceObj.rent = amount;
      if (kind === "extend") priceObj.extend = amount;
    }
  }

  return map;
}

function resolveBucketAndLabel(rawPartner: string, setting: PartnerSettingInfo | undefined, pumpModel: string) {
  const raw = String(rawPartner ?? "").trim();
  const l1 = String(setting?.l1 ?? "").trim();
  const l2 = String(setting?.l2 ?? "").trim();

  if (l1 === "보건소" || raw === "보건소" || raw.endsWith("구") || raw.endsWith("시") || raw.endsWith("군")) {
    return {
      bucket: "보건소",
      label: l2 || raw || "보건소",
    };
  }

  if (l1.startsWith("조리원") || raw.startsWith("조리원")) {
    return {
      bucket: "조리원",
      label: l2 || raw || "조리원",
    };
  }

  if (raw.includes("온라인")) {
    return {
      bucket: "온라인",
      label: normalizePumpModelName(pumpModel),
    };
  }

  if (raw.includes("개인")) {
    return {
      bucket: "개인",
      label: normalizePumpModelName(pumpModel),
    };
  }

  return {
    bucket: "기타",
    label: "기타",
  };
}

function findDayPrice(args: {
  pumpPriceMap: Map<string, Map<string, { rent: number; extend: number }>>;
  rawPartner: string;
  label: string;
  bucket: string;
  pumpModel: string;
}) {
  const candidates = Array.from(new Set([args.rawPartner, args.label, args.bucket].filter(Boolean)));
  const normalizedPump = normalizePumpModelName(args.pumpModel);

  for (const key of candidates) {
    const partnerPriceMap = args.pumpPriceMap.get(key);
    if (!partnerPriceMap) continue;

    const direct = Number(partnerPriceMap.get(normalizedPump)?.rent ?? 0);
    if (direct > 0) return direct;

    for (const [modelName, priceObj] of partnerPriceMap.entries()) {
      if (normalizePumpModelName(modelName) === normalizedPump) {
        const amount = Number(priceObj?.rent ?? 0);
        if (amount > 0) return amount;
      }
    }
  }

  return 0;
}

function buildAggregate(args: {
  rows: RawRow[];
  partnerSettingsMap: Map<string, PartnerSettingInfo>;
  pumpPriceMap: Map<string, Map<string, { rent: number; extend: number }>>;
  periodStart: Date;
  periodEnd: Date;
  granularity: string;
  search: AggregateRunRequest["검색"];
}) {
  const { rows, partnerSettingsMap, pumpPriceMap, periodStart, periodEnd, granularity, search } = args;
  const periods = buildPeriods(periodStart, periodEnd, granularity);
  const serverTodayEnd = addDaysUTC(getServerTodayUTC(), -1);

  const rowMap = new Map<string, AggregateRowOut>();

  for (const row of rows) {
    const startDt = parseDateFlexible(row.start_date);
    if (!startDt) continue;

    if (isTextLike(row.request_date)) continue;

    const rawPartner = String(row.partner_category || "").trim();
    const pumpModel = normalizePumpModelName(row.product_name);
    const setting = partnerSettingsMap.get(rawPartner);
    const resolved = resolveBucketAndLabel(rawPartner, setting, pumpModel);

    const completeDt = parseDateFlexible(row.complete_date);
    const endDt = parseDateFlexible(row.end_date);

    let end: Date | null = null;
    if (completeDt) {
      end = addDaysUTC(completeDt, -1);
    } else if (isNonEmptyText(row.complete_date)) {
      end = endDt || null;
    } else {
      end = resolved.bucket === "조리원" ? serverTodayEnd : endDt || null;
    }

    if (!end) continue;
    if (end.getTime() < startDt.getTime()) continue;

    if (search?.거래처) {
      const q = String(search.거래처).trim();
      const hay = `${rawPartner} ${resolved.label} ${resolved.bucket}`;
      if (!hay.includes(q)) continue;
    }

    if (search?.유축기) {
      const selectedPump = normalizePumpModelName(search.유축기);
      if (normalizePumpModelName(pumpModel) !== selectedPump) continue;
    }

    if (search?.기기번호) {
      if (!String(row.device_no || "").includes(search.기기번호)) continue;
    }

    const dayPrice = findDayPrice({
      pumpPriceMap,
      rawPartner,
      label: resolved.label,
      bucket: resolved.bucket,
      pumpModel,
    });

    if (!dayPrice) continue;

    const rowKey = `${resolved.bucket}||${resolved.label}`;
    if (!rowMap.has(rowKey)) {
      rowMap.set(rowKey, {
        pumpModel: resolved.label,
        partnerCategory: resolved.bucket,
        values: makeEmptyValues(periods),
        sum: initCell(),
      });
    }

    const outRow = rowMap.get(rowKey)!;

    for (const p of periods) {
      const overlap = overlapDaysInclusive(startDt, end, p.start, p.end);
      if (overlap <= 0) continue;

      const cell = outRow.values[p.key];
      if (startDt.getTime() >= p.start.getTime() && startDt.getTime() <= p.end.getTime()) {
        cell.출고 += 1;
      }
      cell.대여일수 += overlap;
      cell.금액 += overlap * dayPrice;
    }
  }

  const rowsOut = Array.from(rowMap.values()).map((row) => {
    const sum = initCell();
    for (const p of periods) addCell(sum, row.values[p.key]);
    row.sum = sum;
    return row;
  });

  rowsOut.sort((a, b) => {
    const ai = BUCKET_ORDER.indexOf(a.partnerCategory as (typeof BUCKET_ORDER)[number]);
    const bi = BUCKET_ORDER.indexOf(b.partnerCategory as (typeof BUCKET_ORDER)[number]);
    if (ai !== bi) return ai - bi;

    if (a.partnerCategory === "온라인" || a.partnerCategory === "개인") {
      const ap = pumpOrderIndex(a.pumpModel);
      const bp = pumpOrderIndex(b.pumpModel);
      if (ap !== bp) return ap - bp;
    }

    return a.pumpModel.localeCompare(b.pumpModel, "ko");
  });

  return {
    periods,
    rows: rowsOut,
  };
}

function toCsv(result: { periods: Period[]; rows: AggregateRowOut[] }) {
  const headers: string[] = ["구분", "거래처/기종"];
  for (const p of result.periods) {
    headers.push(`${p.label}_출고수량`, `${p.label}_대여일수`, `${p.label}_금액`);
  }
  headers.push("합계_출고수량", "합계_대여일수", "합계_금액");

  const lines: string[] = [headers.join(",")];

  for (const r of result.rows) {
    const row: string[] = [r.partnerCategory, r.pumpModel];
    for (const p of result.periods) {
      const v = r.values[p.key] || initCell();
      row.push(String(v.출고), String(v.대여일수), String(v.금액));
    }
    row.push(String(r.sum.출고), String(r.sum.대여일수), String(r.sum.금액));
    lines.push(row.map((x) => `"${String(x).replaceAll(`"`, `""`)}"`).join(","));
  }

  return "\uFEFF" + lines.join("\n");
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");

  const body = (await req.json().catch(() => null)) as AggregateRunRequest | null;
  if (!body) {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const ps = toISODateString(body.기준일자?.periodStart);
  const pe = toISODateString(body.기준일자?.periodEnd);
  const start = parseDateFlexible(ps);
  const end = parseDateFlexible(pe);

  if (!start || !end) {
    return NextResponse.json({ error: "INVALID_PERIOD" }, { status: 400 });
  }
  if (end.getTime() < start.getTime()) {
    return NextResponse.json({ error: "INVALID_PERIOD_RANGE" }, { status: 400 });
  }

  const granularity = body.집계조건 || "월별";
  if (!["기간별", "일별", "월별", "연별"].includes(granularity)) {
    return NextResponse.json({ error: "INVALID_GRANULARITY" }, { status: 400 });
  }

  const [rows, partnerSettingsMap, pumpPriceMap] = await Promise.all([
    loadAllRows(),
    loadPartnerSettingsMap(),
    loadPumpPriceMap(),
  ]);

  const main = buildAggregate({
    rows,
    partnerSettingsMap,
    pumpPriceMap,
    periodStart: start,
    periodEnd: end,
    granularity,
    search: body.검색,
  });

  const compareResults: any[] = [];
  const compare = body.비교기간 || {};

  (["전년동일기간", "전월동일기간"] as const).forEach((key) => {
    if ((compare as any)[key]) {
      const shifted = shiftPeriod(start, end, key);
      const cmp = buildAggregate({
        rows,
        partnerSettingsMap,
        pumpPriceMap,
        periodStart: shifted.start,
        periodEnd: shifted.end,
        granularity,
        search: body.검색,
      });

      compareResults.push({
        label: key,
        periodStart: shifted.start.toISOString().slice(0, 10),
        periodEnd: shifted.end.toISOString().slice(0, 10),
        periods: cmp.periods.map((p) => ({
          key: p.key,
          label: p.label,
          start: p.start.toISOString().slice(0, 10),
          end: p.end.toISOString().slice(0, 10),
        })),
        rows: cmp.rows,
      });
    }
  });

  if (format === "csv") {
    const csv = toCsv(main);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=aggregate_partner_all.csv",
      },
    });
  }

  return NextResponse.json({
    ok: true,
    meta: {
      granularity,
      periodStart: ps,
      periodEnd: pe,
      periods: main.periods.map((p) => ({
        key: p.key,
        label: p.label,
        start: p.start.toISOString().slice(0, 10),
        end: p.end.toISOString().slice(0, 10),
      })),
      partnerBuckets: BUCKET_ORDER,
      pumpScope: "전체",
      selectedPumpModel: "",
    },
    rows: main.rows,
    compareResults,
    deviceRows: [],
    deviceCompareResults: [],
  });
}