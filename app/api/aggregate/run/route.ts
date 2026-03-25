// app/api/aggregate/run/route.ts
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

type CellValue = { 출고: number; 대여일수: number; 금액: number };

type ResultRow = {
  pumpModel: string;
  partnerCategory: string;
  values: Record<string, CellValue>;
  sum: CellValue;
};

type DeviceResultRow = {
  pumpModel: string;
  partnerCategory: string;
  deviceNo: string;
  rentKind: "구매" | "렌탈" | "";
  values: Record<string, CellValue>;
  sum: CellValue;
};

const PARTNER_BUCKETS = ["온라인", "보건소", "조리원", "개인", "기타"] as const;

const PUMP_ORDER = ["심포니", "락티나", "스윙", "스윙맥스", "프리스타일", "시밀레", "각시밀"] as const;

function pumpOrderIndex(name: string) {
  const s = String(name ?? "");
  if (s.includes("심포니")) return 0;
  if (s.includes("락티나")) return 1;
  if (s.includes("스윙맥") || s.includes("스윙맥시") || s.includes("스윙맥스")) return 3;
  if (s.includes("프리스타일")) return 4;
  if (s.includes("스윙")) return 2;
  if (s.includes("시밀래") || s.includes("시밀레")) return 5;
  if (s.includes("각시밀")) return 6;
  return 999;
}

function toISODateString(v: any) {
  return String(v ?? "").trim();
}

function parseDateFlexible(v: any): Date | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;

  // normalize separators
  const s = raw.replaceAll(".", "-").replaceAll("/", "-");

  // YYYY-MM-DD or YYYY-M-D
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
      return dt;
    }
    return null;
  }

  // YY-MM-DD -> 20YY
  m = s.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = 2000 + Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
      return dt;
    }
    return null;
  }

  return null;
}

function isNonEmptyText(v: any) {
  const s = String(v ?? "").trim();
  return s.length > 0;
}

function addDaysUTC(d: Date, days: number) {
  const dt = new Date(d.getTime());
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function buildPeriods(start: Date, end: Date, granularity: string): Period[] {
  const periods: Period[] = [];

  if (granularity === "일별") {
    let cur = new Date(start.getTime());
    while (cur.getTime() <= end.getTime()) {
      const y = cur.getUTCFullYear();
      const mo = cur.getUTCMonth() + 1;
      const d = cur.getUTCDate();
      const key = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const label = `${mo}/${d}`;
      periods.push({
        key,
        label,
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
      const s = new Date(Date.UTC(y, 0, 1));
      const e = new Date(Date.UTC(y, 11, 31));
      periods.push({
        key: String(y),
        label: `${y}년`,
        start: s,
        end: e,
      });
      y++;
    }
    return periods;
  }

  // 월별(default)
  let cur = startOfMonthUTC(start);
  const endMonth = startOfMonthUTC(end);
  while (cur.getTime() <= endMonth.getTime()) {
    const y = cur.getUTCFullYear();
    const mo = cur.getUTCMonth() + 1;
    const key = `${y}-${String(mo).padStart(2, "0")}`;
    const label = `${mo}월`;
    periods.push({
      key,
      label,
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
  const diff = Math.floor((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000));
  return diff + 1;
}

function normalizePartnerName(rawCategory: string, rawReceiver: string) {
  const cat = String(rawCategory ?? "").trim();
  const recv = String(rawReceiver ?? "").trim();

  if (cat.startsWith("조리원")) {
    return recv || cat;
  }
  return cat;
}

function normalizePartnerBucket(name: string) {
  const s = String(name ?? "").trim();
  if (s.startsWith("조리원")) return "조리원";
  if (s === "온라인" || s === "보건소" || s === "개인") return s;
  return "기타";
}

function normalizeRentKind(v: string): "구매" | "렌탈" | "" {
  const s = String(v ?? "").trim();
  if (s.includes("구매")) return "구매";
  if (s.includes("렌탈")) return "렌탈";
  return "";
}

function shiftByMonthsUTC(d: Date, diff: number) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + diff, 1));
  const last = endOfMonthUTC(target).getUTCDate();
  const safeDay = Math.min(day, last);
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), safeDay));
}

function shiftPeriod(start: Date, end: Date, type: "전년동일기간" | "전월동일기간") {
  if (type === "전년동일기간") {
    return {
      start: shiftByMonthsUTC(start, -12),
      end: shiftByMonthsUTC(end, -12),
    };
  }
  // 전월
  return {
    start: shiftByMonthsUTC(start, -1),
    end: shiftByMonthsUTC(end, -1),
  };
}

function initCell(): CellValue {
  return { 출고: 0, 대여일수: 0, 금액: 0 };
}

function addCell(a: CellValue, b: CellValue) {
  a.출고 += b.출고;
  a.대여일수 += b.대여일수;
  a.금액 += b.금액;
}

function makeEmptyValues(periods: Period[]) {
  const obj: Record<string, CellValue> = {};
  for (const p of periods) obj[p.key] = initCell();
  return obj;
}

async function loadAllRows() {
  const candidates = [
    "recovery1",
    "recovery2",
    "recovery_complete_1",
    "recovery_complete_2",
    "recovery_recovery1",
    "recovery_recovery2",
  ];

  const existR = await query(
    `
    SELECT t.name
    FROM unnest($1::text[]) AS t(name)
    WHERE to_regclass('public.' || t.name) IS NOT NULL
    `,
    [candidates]
  );

  const existingTables = (existR.rows || [])
    .map((x: any) => String(x?.name || "").trim())
    .filter(Boolean);

  const unionParts: string[] = [];

  unionParts.push(`
    SELECT
      u.data->>'시작일' AS start_date,
      u.data->>'반납완료일' AS return_date,
      u.data->>'종료일' AS end_date,
      u.data->>'거래처분류' AS partner_category,
      u.data->>'수취인명' AS receiver_name,
      u.data->>'제품' AS product_name,
      u.data->>'기기번호' AS device_no,
      u.data->>'대여형태' AS rent_kind
    FROM unified u
  `);

 for (const t of existingTables) {
    unionParts.push(`
      SELECT
        x.data->>'시작일' AS start_date,
        x.data->>'반납완료일' AS return_date,
        x.data->>'종료일' AS end_date,
        x.data->>'거래처분류' AS partner_category,
        x.data->>'수취인명' AS receiver_name,
        x.data->>'제품' AS product_name,
        x.data->>'기기번호' AS device_no,
        x.data->>'대여형태' AS rent_kind
      FROM ${t} x
    `);
  }

  const sql = `
    ${unionParts.join("\nUNION ALL\n")}
  `;

  const r = await query(sql);
  return (r.rows || []).map((x: any) => ({
    start_date: String(x.start_date ?? "").trim(),
    return_date: String(x.return_date ?? "").trim(),
    end_date: String(x.end_date ?? "").trim(),
    partner_category: String(x.partner_category ?? "").trim(),
    receiver_name: String(x.receiver_name ?? "").trim(),
    product_name: String(x.product_name ?? "").trim(),
    device_no: String(x.device_no ?? "").trim(),
    rent_kind: String(x.rent_kind ?? "").trim(),
  }));
}

async function loadPartnerCategoryMap() {
  const r = await query(
    `
    SELECT s.partner_name, c1.name AS l1_name
    FROM agg_partner_settings s
    LEFT JOIN agg_partner_categories c1 ON c1.id = s.partner_cat_l1_id
    `
  );

  const map = new Map<string, string>();
  for (const row of r.rows || []) {
    const name = String(row.partner_name ?? "").trim();
    const l1 = String(row.l1_name ?? "").trim();
    if (name) map.set(name, l1);
  }
  return map;
}

async function loadPumpPriceMap() {
  const r = await query(
    `
    SELECT
      p.partner_name,
      m.name AS pump_model_name,
      p.kind,
      pr.amount
    FROM agg_partner_pump_prices p
    JOIN agg_pump_models m ON m.id = p.pump_model_id
    JOIN agg_prices pr ON pr.id = p.price_id
    `
  );

  const map = new Map<string, Map<string, { rent: number; extend: number }>>();

  for (const row of r.rows || []) {
    const partner = String(row.partner_name ?? "").trim();
    const pump = String(row.pump_model_name ?? "").trim();
    const kind = String(row.kind ?? "") as PriceKind;
    const amount = Number(row.amount ?? 0);

    if (!partner || !pump) continue;

    if (!map.has(partner)) map.set(partner, new Map());
    const pumpMap = map.get(partner)!;

    if (!pumpMap.has(pump)) pumpMap.set(pump, { rent: 0, extend: 0 });
    const p = pumpMap.get(pump)!;

    if (kind === "rent") p.rent = amount;
    if (kind === "extend") p.extend = amount;
  }

  return map;
}

function buildAggregate(
  rows: Awaited<ReturnType<typeof loadAllRows>>,
  partnerCatMap: Map<string, string>,
  pumpPriceMap: Map<string, Map<string, { rent: number; extend: number }>>,
  periodStart: Date,
  periodEnd: Date,
  granularity: string,
  filters: AggregateRunRequest["필터"],
  search: AggregateRunRequest["검색"]
) {
  const periods = buildPeriods(periodStart, periodEnd, granularity);
  const valuesByPump = new Map<string, Map<string, ResultRow>>();
  const deviceRowsOut: DeviceResultRow[] = [];

  function getRow(pumpModel: string, partnerCategory: string) {
    if (!valuesByPump.has(pumpModel)) valuesByPump.set(pumpModel, new Map());
    const map = valuesByPump.get(pumpModel)!;
    if (!map.has(partnerCategory)) {
      map.set(partnerCategory, {
        pumpModel,
        partnerCategory,
        values: makeEmptyValues(periods),
        sum: initCell(),
      });
    }
    return map.get(partnerCategory)!;
  }

  for (const row of rows) {
    const startDt = parseDateFlexible(row.start_date);
    if (!startDt) continue;

    const returnDt = parseDateFlexible(row.return_date);
    const endDt = parseDateFlexible(row.end_date);

    const partnerName = normalizePartnerName(row.partner_category, row.receiver_name);
    const l1 = partnerCatMap.get(partnerName) || row.partner_category || "";
    const bucket = normalizePartnerBucket(l1);

    // partnerScope filter
    if (filters.거래처 !== "전체" && filters.거래처 !== bucket) {
      continue;
    }

    // pumpScope + search
    if (filters.유축기 === "기종" && search.유축기) {
      if (!row.product_name.includes(search.유축기)) continue;
    }
    if (search.거래처 && !partnerName.includes(search.거래처)) {
      continue;
    }

    // determine end based on rules
    let end: Date | null = null;

    if (returnDt) {
      end = addDaysUTC(returnDt, -1);
    } else if (isNonEmptyText(row.return_date)) {
      // non-date text -> use 종료일
      if (endDt) end = endDt;
    } else {
      // empty return date
      if (bucket === "조리원") {
        end = periodEnd;
      } else {
        end = endDt;
      }
    }

    if (!end) continue;

    // end < start -> skip
    if (end.getTime() < startDt.getTime()) continue;
    
    const pumpModel = row.product_name || "미지정";

    const price = pumpPriceMap.get(partnerName)?.get(pumpModel)?.rent ?? 0;

    const rentKind = normalizeRentKind((row as any).rent_kind || "");

    for (const p of periods) {
      const overlap = overlapDaysInclusive(startDt, end, p.start, p.end);
      if (overlap <= 0) continue;

      const cell = getRow(pumpModel, bucket).values[p.key];

      // 출고수량
      if (startDt.getTime() >= p.start.getTime() && startDt.getTime() <= p.end.getTime()) {
        cell.출고 += 1;
      }

      // 대여일수(기간 겹침일수)
      cell.대여일수 += overlap;

      // 금액
      cell.금액 += overlap * price;
    }

    const deviceValues = makeEmptyValues(periods);
    for (const p of periods) {
      const overlap = overlapDaysInclusive(startDt, end, p.start, p.end);
      if (overlap <= 0) continue;

      if (startDt.getTime() >= p.start.getTime() && startDt.getTime() <= p.end.getTime()) {
        deviceValues[p.key].출고 += 1;
      }
      deviceValues[p.key].대여일수 += overlap;
      deviceValues[p.key].금액 += overlap * price;
    }

    const deviceSum = initCell();
    for (const p of periods) addCell(deviceSum, deviceValues[p.key]);

    deviceRowsOut.push({
      pumpModel,
      partnerCategory: bucket,
      deviceNo: row.device_no || "-",
      rentKind,
      values: deviceValues,
      sum: deviceSum,
    });
  }

  // build rows (ordered)
  const pumpModels = Array.from(valuesByPump.keys()).sort((a, b) => {
    const ai = pumpOrderIndex(a);
    const bi = pumpOrderIndex(b);
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b, "ko");
  });
  const rowsOut: ResultRow[] = [];

  for (const pump of pumpModels) {
    const rowMap = valuesByPump.get(pump)!;

    // fill missing buckets
    for (const b of PARTNER_BUCKETS) {
      if (!rowMap.has(b)) {
        rowMap.set(b, {
          pumpModel: pump,
          partnerCategory: b,
          values: makeEmptyValues(periods),
          sum: initCell(),
        });
      }
    }

    // compute sum per row
    for (const r of rowMap.values()) {
      const sum = initCell();
      for (const p of periods) {
        addCell(sum, r.values[p.key]);
      }
      r.sum = sum;
    }

    // push in fixed order
    for (const b of PARTNER_BUCKETS) {
      rowsOut.push(rowMap.get(b)!);
    }

    // 소계
    const subtotal: ResultRow = {
      pumpModel: pump,
      partnerCategory: "소계",
      values: makeEmptyValues(periods),
      sum: initCell(),
    };

    for (const b of PARTNER_BUCKETS) {
      const r = rowMap.get(b)!;
      for (const p of periods) addCell(subtotal.values[p.key], r.values[p.key]);
    }
    for (const p of periods) addCell(subtotal.sum, subtotal.values[p.key]);
    rowsOut.push(subtotal);
  }

  return { periods, rows: rowsOut, deviceRows: deviceRowsOut };
}

function toCSV(result: { periods: Period[]; rows: ResultRow[] }) {
  const headers: string[] = ["기종", "거래처"];
  for (const p of result.periods) {
    headers.push(`${p.label}_출고`, `${p.label}_대여일수`, `${p.label}_금액`);
  }
  headers.push("합계_출고", "합계_대여일수", "합계_금액");

  const lines: string[] = [];
  lines.push(headers.join(","));

  for (const r of result.rows) {
    const row: string[] = [r.pumpModel, r.partnerCategory];
    for (const p of result.periods) {
      const v = r.values[p.key];
      row.push(String(v.출고), String(v.대여일수), String(v.금액));
    }
    row.push(String(r.sum.출고), String(r.sum.대여일수), String(r.sum.금액));
    lines.push(row.map((x) => `"${String(x).replaceAll(`"`, `""`)}"`).join(","));
  }

  // BOM for Excel
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
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

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

  const rows = await loadAllRows();
  const partnerCatMap = await loadPartnerCategoryMap();
  const pumpPriceMap = await loadPumpPriceMap();

  const main = buildAggregate(
    rows,
    partnerCatMap,
    pumpPriceMap,
    start,
    end,
    granularity,
    body.필터,
    body.검색
  );

  const compareResults: any[] = [];
  const compare = body.비교기간 || {};

  (["전년동일기간", "전월동일기간"] as const).forEach((key) => {
    if ((compare as any)[key]) {
      const shifted = shiftPeriod(start, end, key);
      const cmp = buildAggregate(
        rows,
        partnerCatMap,
        pumpPriceMap,
        shifted.start,
        shifted.end,
        granularity,
        body.필터,
        body.검색
      );
      compareResults.push({
        label: key,
        periodStart: shifted.start.toISOString().slice(0, 10),
        periodEnd: shifted.end.toISOString().slice(0, 10),
        ...cmp,
      });
    }
  });

  if (format === "csv") {
    const csv = toCSV(main);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=aggregate_pump_all.csv",
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
      partnerBuckets: PARTNER_BUCKETS,
      pumpScope: body.필터?.유축기 || "전체",
      selectedPumpModel: body.검색?.유축기 || "",
    },
    rows: main.rows,
    compareResults,
    deviceRows: main.deviceRows || [],
  });   
}