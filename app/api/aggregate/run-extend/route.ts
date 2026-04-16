import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";
import type {
  AggregateRunExtendResponse,
  AggregateExtendResultRow,
  AggregateExtendPeriodMeta,
} from "@/aggregate/run/types.aggregateExtendResult";
import { parseExtendValue } from "@/aggregate/extend/parseExtendValue";
import { calcExtendPeriods } from "@/aggregate/extend/calcExtendPeriods";
import {
  normalizeAggregateRow,
  type AggregateRawRow,
  type NormalizedAggregateRow,
} from "@/aggregate/extend/normalizeAggregateRow";
import { makeDedupKey } from "@/aggregate/extend/dedupKey";

type Cell = { 출고수량: number; 수량: number; 대여일수: number; 금액: number };

type RawUnionRow = AggregateRawRow;

const PUMP_ORDER = ["심포니", "락티나", "스윙", "스윙맥시", "프리스타일", "시밀래", "각시밀"] as const;
const PARTNERS = ["온라인", "보건소", "개인", "기타"] as const; // 조리원 제외

function toDateOnly(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.replaceAll(".", "-").replaceAll("/", "-").match(/^(\d{2,4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function normalizePumpModelName(name: string) {
  const s = String(name ?? "").trim();
  if (s.includes("심포니")) return "심포니";
  if (s.includes("락티나")) return "락티나";
  if (s.includes("스윙맥") || s.includes("스윙맥시") || s.includes("스윙맥스")) return "스윙맥시";
  if (s.includes("프리스타일")) return "프리스타일";
  if (s.includes("스윙")) return "스윙";
  if (s.includes("시밀래") || s.includes("시밀레")) return "시밀래";
  if (s.includes("각시밀")) return "각시밀";
  return s || "미지정";
}

function normalizePartnerBucket(v: any) {
  const s = String(v ?? "").trim();
  if (s.startsWith("조리원")) return "조리원";
  if (s === "온라인" || s === "보건소" || s === "개인") return s;
  return "기타";
}

function normalizePartnerName(rawCategory: string, rawReceiver: string) {
  const cat = String(rawCategory ?? "").trim();
  const recv = String(rawReceiver ?? "").trim();
  if (cat.startsWith("조리원")) return recv || cat;
  return cat;
}

function overlapDaysInclusive(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const s = aStart.getTime() > bStart.getTime() ? aStart : bStart;
  const e = aEnd.getTime() < bEnd.getTime() ? aEnd : bEnd;
  if (e.getTime() < s.getTime()) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

function emptyCell(): Cell {
  return { 출고수량: 0, 수량: 0, 대여일수: 0, 금액: 0 };
}

function addCell(a: Cell, b: Cell) {
  a.출고수량 += b.출고수량;
  a.수량 += b.수량;
  a.대여일수 += b.대여일수;
  a.금액 += b.금액;
}

function stepKey(step: number) {
  return `${step}차연장`;
}

function stepLabel(step: number) {
  return `${step}차연장`;
}

function parseExtendStepFromFieldKey(k: string): number | null {
  const s = String(k ?? "").trim();
  if (s === "0차연장") return 0;
  const m = s.match(/^([1-9]\d*)차연장$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return n;
}

function getPresentSteps(rows: Array<{ data: Record<string, any> }>) {
  const set = new Set<number>();
  set.add(0);

  for (const r of rows) {
    const data = r.data || {};
    for (const k of Object.keys(data)) {
      const step = parseExtendStepFromFieldKey(k);
      if (step == null) continue;
      const val = String(data[k] ?? "").trim();
      if (!val) continue;
      set.add(step);
    }
  }

  return Array.from(set).sort((a, b) => a - b);
}

function makePeriodsFromSteps(steps: number[]): AggregateExtendPeriodMeta[] {
  return steps.map((s) => ({ key: stepKey(s), label: stepLabel(s) }));
}

function pumpOrderIndex(name: string) {
  const normalized = normalizePumpModelName(name);
  const idx = PUMP_ORDER.indexOf(normalized as any);
  return idx >= 0 ? idx : 999;
}

function makeRowsSkeleton(periods: AggregateExtendPeriodMeta[]): AggregateExtendResultRow[] {
  const rows: AggregateExtendResultRow[] = [];

  const pumps = [...PUMP_ORDER];
  for (const pump of pumps) {
    for (const partner of PARTNERS) {
      const values: Record<string, Cell> = {};
      for (const p of periods) values[p.key] = emptyCell();
      rows.push({
        pumpModel: pump,
        partnerCategory: partner,
        values,
        sum: emptyCell(),
        weight: 0,
      });
    }

    const subtotalValues: Record<string, Cell> = {};
    for (const p of periods) subtotalValues[p.key] = emptyCell();
    rows.push({
      pumpModel: pump,
      partnerCategory: "소계",
      values: subtotalValues,
      sum: emptyCell(),
      weight: 0,
    });
  }

  return rows;
}

function toCsv(resp: AggregateRunExtendResponse) {
  const headers = ["기종", "거래처"];
  for (const p of resp.meta.periods) {
  const isZero = p.key === "0차연장";
  headers.push(
    `${p.label}_${isZero ? "출고수량" : "수량"}`,
    `${p.label}_대여일수`,
    `${p.label}_금액`
  );
}

  headers.push("합계_수량", "합계_대여일수", "합계_금액", "비중치");

  const lines = [headers.join(",")];

  for (const r of resp.rows) {
  const row: string[] = [r.pumpModel, r.partnerCategory];

  let zeroAmount = 0;
  let onePlusCount = 0;
  let onePlusDays = 0;
  let onePlusAmount = 0;

  for (const p of resp.meta.periods) {
    const v = r.values[p.key] || emptyCell();
    const count = p.key === "0차연장" ? v.출고수량 : v.수량;

    row.push(String(count), String(v.대여일수), String(v.금액));

    if (p.key === "0차연장") {
      zeroAmount += Number(v.금액 || 0);
    } else {
      onePlusCount += Number(count || 0);
      onePlusDays += Number(v.대여일수 || 0);
      onePlusAmount += Number(v.금액 || 0);
    }
  }

  const denom = zeroAmount + onePlusAmount;
  const weightPct = denom > 0 ? (onePlusAmount / denom) * 100 : 0;

  row.push(
    String(onePlusCount),
    String(onePlusDays),
    String(onePlusAmount),
    `${weightPct.toFixed(1)}%`
  );

  lines.push(row.map((x) => `"${String(x).replaceAll(`"`, `""`)}"`).join(","));
}

  return "\uFEFF" + lines.join("\n");
}

async function loadPartnerCategoryMap() {
  const r = await query(
    `SELECT s.partner_name, c1.name AS l1_name
     FROM agg_partner_settings s
     LEFT JOIN agg_partner_categories c1 ON c1.id = s.partner_cat_l1_id`
  );

  const map = new Map<string, string>();
  for (const row of r.rows || []) {
    const name = String(row.partner_name ?? "").trim();
    const l1 = String(row.l1_name ?? "").trim();
    if (name) map.set(name, l1);
  }
  return map;
}

async function loadPriceMap() {
  const r = await query(
    `SELECT p.partner_name, m.name AS pump_model_name, p.kind, pr.amount
     FROM agg_partner_pump_prices p
     JOIN agg_pump_models m ON m.id = p.pump_model_id
     JOIN agg_prices pr ON pr.id = p.price_id`
  );

  const map = new Map<string, Map<string, { rent: number; extend: number }>>();

  for (const row of r.rows || []) {
    const partner = String(row.partner_name ?? "").trim();
    const pump = normalizePumpModelName(String(row.pump_model_name ?? "").trim());
    const kind = String(row.kind ?? "").trim();
    const amount = Number(row.amount ?? 0);

    if (!partner || !pump) continue;
    if (!map.has(partner)) map.set(partner, new Map());

    const pumpMap = map.get(partner)!;
    if (!pumpMap.has(pump)) pumpMap.set(pump, { rent: 0, extend: 0 });

    const price = pumpMap.get(pump)!;
    if (kind === "rent") price.rent = amount;
    if (kind === "extend") price.extend = amount;
  }

  return map;
}

function buildPartnerPriceKeys(partnerName: string, bucket: string) {
  const s = String(partnerName ?? "").trim();
  const keys = new Set<string>();

  if (bucket === "보건소") keys.add("보건소");
  if (s) keys.add(s);

  if (s.endsWith("구") || s.endsWith("시") || s.endsWith("군")) {
    const head = s.slice(0, -1).trim();
    if (head) keys.add(head);
  }

  return Array.from(keys);
}

function resolvePricePair(params: {
  pumpPriceMap: Map<string, Map<string, { rent: number; extend: number }>>;
  partnerName: string;
  bucket: string;
  pumpModel: string;
}) {
  const { pumpPriceMap, partnerName, bucket, pumpModel } = params;
  const partnerKeys = buildPartnerPriceKeys(partnerName, bucket);

  for (const key of partnerKeys) {
    const partnerPriceMap = pumpPriceMap.get(key);
    if (!partnerPriceMap) continue;

    const direct = partnerPriceMap.get(pumpModel);
    if (direct && (Number(direct.rent ?? 0) > 0 || Number(direct.extend ?? 0) > 0)) {
      return {
        rent: Number(direct.rent ?? 0),
        extend: Number(direct.extend ?? 0),
      };
    }

    for (const [modelName, priceObj] of partnerPriceMap.entries()) {
      if (normalizePumpModelName(modelName) === pumpModel) {
        const rent = Number(priceObj?.rent ?? 0);
        const extend = Number(priceObj?.extend ?? 0);
        if (rent > 0 || extend > 0) {
          return { rent, extend };
        }
      }
    }
  }

  return { rent: 0, extend: 0 };
}

function getSelectedSteps(
  extendScope: AggregateRunRequest["필터"]["연장"] | undefined,
  presentSteps: number[]
) {
  if (!extendScope || extendScope === "전체") {
    return presentSteps.length > 0 ? presentSteps : [0];
  }

  if (extendScope === "0차") return [0];

  const m = String(extendScope).match(/^(\d+)차$/);
  if (!m) return presentSteps.length > 0 ? presentSteps : [0];

  return [Number(m[1])];
}

async function loadAllRowsForExtend(): Promise<RawUnionRow[]> {
  const candidates = [
    "recovery1",
    "recovery2",
    "recovery_complete_1",
    "recovery_complete_2",
    "recovery_recovery1",
    "recovery_recovery2",
  ];

  const existR = await query(
    `SELECT t.name
     FROM unnest($1::text[]) AS t(name)
     WHERE to_regclass('public.' || t.name) IS NOT NULL`,
    [candidates]
  );
  const existingTables = (existR.rows || [])
    .map((x: any) => String(x?.name || "").trim())
    .filter(Boolean);

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
      COALESCE(NULLIF(u.data->>'구매/렌탈',''), u.data->>'대여형태') AS rent_kind,
      u.data AS data
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
        COALESCE(NULLIF(x.data->>'구매/렌탈',''), x.data->>'대여형태') AS rent_kind,
        x.data AS data
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
    data: x.data || {},
  }));
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");

  const body = (await req.json().catch(() => null)) as AggregateRunRequest | null;
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  if (body?.필터?.집계타입 !== "연장") {
    return NextResponse.json({ error: "INVALID_AGGREGATE_TARGET_FOR_RUN_EXTEND" }, { status: 400 });
  }

  const periodStartRaw = String(body?.기준일자?.periodStart ?? "").trim();
  const periodEndRaw = String(body?.기준일자?.periodEnd ?? "").trim();
  const periodStart = toDateOnly(periodStartRaw);
  const periodEnd = toDateOnly(periodEndRaw);

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "INVALID_PERIOD" }, { status: 400 });
  }
  if (periodEnd.getTime() < periodStart.getTime()) {
    return NextResponse.json({ error: "INVALID_PERIOD_RANGE" }, { status: 400 });
  }

  const allRows = await loadAllRowsForExtend();
  const partnerCatMap = await loadPartnerCategoryMap();
  const priceMap = await loadPriceMap();

  const filters = body.필터;
  const search = body.검색 || {};

  const compare = body.비교기간 || {};
const compareTargets: Array<{ label: "전년동일기간" | "전월동일기간"; start: Date; end: Date }> = [];

if ((compare as any).전년동일기간) {
  compareTargets.push({
    label: "전년동일기간",
    start: new Date(Date.UTC(periodStart.getUTCFullYear() - 1, periodStart.getUTCMonth(), periodStart.getUTCDate())),
    end: new Date(Date.UTC(periodEnd.getUTCFullYear() - 1, periodEnd.getUTCMonth(), periodEnd.getUTCDate())),
  });
}
if ((compare as any).전월동일기간) {
  compareTargets.push({
    label: "전월동일기간",
    start: new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() - 1, periodStart.getUTCDate())),
    end: new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, periodEnd.getUTCDate())),
  });
}

  const preparedRows: Array<{
    ev: NormalizedAggregateRow;
    bucket: string;
    partnerName: string;
    pumpModel: string;
    rentDayPrice: number;
    extendDayPrice: number;
  }> = [];

  for (const raw of allRows) {
    const normalized = normalizeAggregateRow(raw);
    if (!normalized.ok || !normalized.value) continue;

    const ev = normalized.value;
    const rawPartnerCategory = String(ev.partnerCategory ?? "").trim();
    const partnerName = normalizePartnerName(rawPartnerCategory, ev.receiverName);

    const l1ByPartnerName = partnerCatMap.get(partnerName) || "";
    const l1ByRawCategory = partnerCatMap.get(rawPartnerCategory) || "";
    const l1FromSettings = l1ByPartnerName || l1ByRawCategory || "";
    if (!l1FromSettings) continue;

    const bucket = normalizePartnerBucket(l1FromSettings);
    if (bucket === "조리원") continue;
    if (filters.거래처 !== "전체" && filters.거래처 !== bucket) continue;

    const pumpModel = normalizePumpModelName(ev.productName);
    if (filters.유축기 === "기종" && search.유축기) {
      const selectedPump = normalizePumpModelName(search.유축기);
      if (pumpModel !== selectedPump) continue;
    }

    if (search.거래처 && !partnerName.includes(String(search.거래처))) continue;
    if (search.기기번호 && !String(ev.deviceNo || "").includes(String(search.기기번호))) continue;

    if (filters.대여형태 !== "전체") {
      const rentKind = String(ev.rentKind ?? "").trim();
      if (!rentKind.includes(filters.대여형태)) continue;
    }

    const pricePair = resolvePricePair({
      pumpPriceMap: priceMap,
      partnerName,
      bucket,
      pumpModel,
    });

    if (pricePair.rent <= 0 && pricePair.extend <= 0) continue;

    preparedRows.push({
      ev,
      bucket,
      partnerName,
      pumpModel,
      rentDayPrice: pricePair.rent,
      extendDayPrice: pricePair.extend,
    });
  }

  const presentStepsAll = getPresentSteps(preparedRows.map((x) => ({ data: x.ev.sourceData || {} })));
  const selectedSteps = getSelectedSteps(filters.연장, presentStepsAll);
  const selectedStepSet = new Set(selectedSteps);

  const periods = makePeriodsFromSteps(selectedSteps);
  const rows = makeRowsSkeleton(periods);

  const rowMap = new Map<string, AggregateExtendResultRow>();
  for (const r of rows) {
    rowMap.set(`${r.pumpModel}||${r.partnerCategory}`, r);
  }

  const dedupSet = new Set<string>();

  for (const item of preparedRows) {
    const { ev, bucket, pumpModel, rentDayPrice, extendDayPrice } = item;
    const target = rowMap.get(`${pumpModel}||${bucket}`);
    if (!target) continue;

    const dedupKey = makeDedupKey({
      deviceNo: ev.deviceNo,
      receiverName: ev.receiverName,
      start: ev.start,
      end: ev.end,
    });
    if (dedupSet.has(dedupKey)) continue;
    dedupSet.add(dedupKey);

    const stepDaysMap: Record<number, number> = {};
    for (const [fieldKey, fieldValue] of Object.entries(ev.sourceData || {})) {
      const step = parseExtendStepFromFieldKey(fieldKey);
      if (step == null) continue;

      const parsed = parseExtendValue(fieldValue);
      if (parsed.days > 0) stepDaysMap[step] = parsed.days;
    }

    const extendPeriods = calcExtendPeriods({
      startDate: ev.start,
      stepDaysMap,
    });

    for (const ep of extendPeriods) {
      if (!selectedStepSet.has(ep.step)) continue;

      const key = ep.key;
      if (!target.values[key]) continue;

      const effectiveEnd =
        ep.end.getTime() > ev.end.getTime() ? new Date(ev.end.getTime()) : ep.end;

      if (effectiveEnd.getTime() < ep.start.getTime()) continue;

      const overlap = overlapDaysInclusive(ep.start, effectiveEnd, periodStart, periodEnd);
      if (overlap <= 0) continue;

      const dayPrice = ep.step === 0 ? rentDayPrice : extendDayPrice;
      if (dayPrice <= 0) continue;

      const v = target.values[key] || emptyCell();

      // 0차: 기존과 동일(출고수량)
      // 1차~n차: 수량(해당 차수에 overlap이 있으면 1건)
      if (ep.step === 0) {
        if (ep.start.getTime() >= periodStart.getTime() && ep.start.getTime() <= periodEnd.getTime()) {
         v.출고수량 += 1;
        }
     } else {
       v.수량 += 1;
     }

v.대여일수 += overlap;
v.금액 += overlap * dayPrice;
target.values[key] = v;
    }
  }

  const sumPeriods = periods.filter((p) => p.key !== "0차연장");

  for (const pump of [...PUMP_ORDER].sort((a, b) => pumpOrderIndex(a) - pumpOrderIndex(b))) {
    const subtotal = rowMap.get(`${pump}||소계`);
    if (!subtotal) continue;

    for (const partner of PARTNERS) {
      const r = rowMap.get(`${pump}||${partner}`);
      if (!r) continue;

      r.sum = emptyCell();
      for (const p of sumPeriods) addCell(r.sum, r.values[p.key] || emptyCell());

      for (const p of periods) {
        const sv = subtotal.values[p.key] || emptyCell();
        addCell(sv, r.values[p.key] || emptyCell());
        subtotal.values[p.key] = sv;
      }

      subtotal.weight += r.weight;
    }

    subtotal.sum = emptyCell();
    for (const p of sumPeriods) addCell(subtotal.sum, subtotal.values[p.key] || emptyCell());
  }

  // 타입 파일(수량 필드 미포함)과의 호환을 위해 응답 직전에 필드 정규화
for (const r of rows) {
  for (const p of periods) {
    const v = r.values[p.key] || emptyCell();
    r.values[p.key] = {
      출고수량: Number(v.출고수량 || 0),
      수량: Number(v.수량 || 0),
      대여일수: Number(v.대여일수 || 0),
      금액: Number(v.금액 || 0),
    } as any;
  }
  r.sum = {
    출고수량: Number(r.sum?.출고수량 || 0),
    수량: Number((r.sum as any)?.수량 || 0),
    대여일수: Number(r.sum?.대여일수 || 0),
    금액: Number(r.sum?.금액 || 0),
  } as any;
}

 const response: AggregateRunExtendResponse = {
  ok: true,
  meta: {
    periodStart: periodStartRaw,
    periodEnd: periodEndRaw,
    periods,
  },
  rows,
  compareResults: [],
};

  if (format === "csv") {
    const csv = toCsv(response);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=aggregate_extend.csv",
      },
    });
  }

 for (const ct of compareTargets) {
  // 현재 로직 재사용을 위해 기간만 바꿔 동일 계산 수행
  const cPeriodStart = ct.start;
  const cPeriodEnd = ct.end;

  const cPreparedRows: Array<{
    ev: NormalizedAggregateRow;
    bucket: string;
    partnerName: string;
    pumpModel: string;
    rentDayPrice: number;
    extendDayPrice: number;
  }> = [];

  for (const raw of allRows) {
    const normalized = normalizeAggregateRow(raw);
    if (!normalized.ok || !normalized.value) continue;

    const ev = normalized.value;
    const rawPartnerCategory = String(ev.partnerCategory ?? "").trim();
    const partnerName = normalizePartnerName(rawPartnerCategory, ev.receiverName);

    const l1ByPartnerName = partnerCatMap.get(partnerName) || "";
    const l1ByRawCategory = partnerCatMap.get(rawPartnerCategory) || "";
    const l1FromSettings = l1ByPartnerName || l1ByRawCategory || "";
    if (!l1FromSettings) continue;

    const bucket = normalizePartnerBucket(l1FromSettings);
    if (bucket === "조리원") continue;
    if (filters.거래처 !== "전체" && filters.거래처 !== bucket) continue;

    const pumpModel = normalizePumpModelName(ev.productName);
    if (filters.유축기 === "기종" && search.유축기) {
      const selectedPump = normalizePumpModelName(search.유축기);
      if (pumpModel !== selectedPump) continue;
    }

    if (search.거래처 && !partnerName.includes(String(search.거래처))) continue;
    if (search.기기번호 && !String(ev.deviceNo || "").includes(String(search.기기번호))) continue;

    if (filters.대여형태 !== "전체") {
      const rentKind = String(ev.rentKind ?? "").trim();
      if (!rentKind.includes(filters.대여형태)) continue;
    }

    const pricePair = resolvePricePair({
      pumpPriceMap: priceMap,
      partnerName,
      bucket,
      pumpModel,
    });
    if (pricePair.rent <= 0 && pricePair.extend <= 0) continue;

    cPreparedRows.push({
      ev,
      bucket,
      partnerName,
      pumpModel,
      rentDayPrice: pricePair.rent,
      extendDayPrice: pricePair.extend,
    });
  }

  const cPeriods = makePeriodsFromSteps(selectedSteps);
  const cRows = makeRowsSkeleton(cPeriods);
  const cRowMap = new Map<string, AggregateExtendResultRow>();
  for (const r of cRows) cRowMap.set(`${r.pumpModel}||${r.partnerCategory}`, r);

  const cDedupSet = new Set<string>();

  for (const item of cPreparedRows) {
    const { ev, bucket, pumpModel, rentDayPrice, extendDayPrice } = item;
    const target = cRowMap.get(`${pumpModel}||${bucket}`);
    if (!target) continue;

    const dedupKey = makeDedupKey({
      deviceNo: ev.deviceNo,
      receiverName: ev.receiverName,
      start: ev.start,
      end: ev.end,
    });
    if (cDedupSet.has(dedupKey)) continue;
    cDedupSet.add(dedupKey);

    const stepDaysMap: Record<number, number> = {};
    for (const [fieldKey, fieldValue] of Object.entries(ev.sourceData || {})) {
      const step = parseExtendStepFromFieldKey(fieldKey);
      if (step == null) continue;
      const parsed = parseExtendValue(fieldValue);
      if (parsed.days > 0) stepDaysMap[step] = parsed.days;
    }

    const extendPeriods = calcExtendPeriods({
      startDate: ev.start,
      stepDaysMap,
    });

    for (const ep of extendPeriods) {
      if (!selectedStepSet.has(ep.step)) continue;
      const key = ep.key;
      if (!target.values[key]) continue;

      const effectiveEnd = ep.end.getTime() > ev.end.getTime() ? new Date(ev.end.getTime()) : ep.end;
      if (effectiveEnd.getTime() < ep.start.getTime()) continue;

      const overlap = overlapDaysInclusive(ep.start, effectiveEnd, cPeriodStart, cPeriodEnd);
      if (overlap <= 0) continue;

      const dayPrice = ep.step === 0 ? rentDayPrice : extendDayPrice;
      if (dayPrice <= 0) continue;

      const v = (target.values[key] as any) || emptyCell();

      if (ep.step === 0) {
        if (ep.start.getTime() >= cPeriodStart.getTime() && ep.start.getTime() <= cPeriodEnd.getTime()) {
          v.출고수량 += 1;
        }
      } else {
        v.수량 += 1;
      }

      v.대여일수 += overlap;
      v.금액 += overlap * dayPrice;
      target.values[key] = v;
    }
  }

  const cSumPeriods = cPeriods.filter((p) => p.key !== "0차연장");
  for (const pump of [...PUMP_ORDER].sort((a, b) => pumpOrderIndex(a) - pumpOrderIndex(b))) {
    const subtotal = cRowMap.get(`${pump}||소계`);
    if (!subtotal) continue;

    for (const partner of PARTNERS) {
      const r = cRowMap.get(`${pump}||${partner}`);
      if (!r) continue;

      r.sum = emptyCell() as any;
      for (const p of cSumPeriods) addCell(r.sum as any, (r.values[p.key] as any) || emptyCell());

      for (const p of cPeriods) {
        const sv = (subtotal.values[p.key] as any) || emptyCell();
        addCell(sv, (r.values[p.key] as any) || emptyCell());
        subtotal.values[p.key] = sv as any;
      }
    }

    subtotal.sum = emptyCell() as any;
    for (const p of cSumPeriods) addCell(subtotal.sum as any, (subtotal.values[p.key] as any) || emptyCell());
  }

  response.compareResults!.push({
    label: ct.label,
    meta: {
      periodStart: ct.start.toISOString().slice(0, 10),
      periodEnd: ct.end.toISOString().slice(0, 10),
      periods: cPeriods,
    },
    rows: cRows,
  });
}

  return NextResponse.json(response);
}