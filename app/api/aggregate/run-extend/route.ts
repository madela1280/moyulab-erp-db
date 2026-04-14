import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { query } from "@/lib/db";
import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";
import type {
  AggregateRunExtendResponse,
  AggregateExtendResultRow,
  AggregateExtendPeriodMeta,
} from "@/aggregate/run/types.aggregateExtendResult";

type Cell = { 출고수량: number; 대여일수: number; 금액: number };

type RawUnified = {
  data: Record<string, any>;
};

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

function overlapDaysInclusive(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const s = aStart.getTime() > bStart.getTime() ? aStart : bStart;
  const e = aEnd.getTime() < bEnd.getTime() ? aEnd : bEnd;
  if (e.getTime() < s.getTime()) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

function emptyCell(): Cell {
  return { 출고수량: 0, 대여일수: 0, 금액: 0 };
}

function addCell(a: Cell, b: Cell) {
  a.출고수량 += b.출고수량;
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

function getPresentSteps(rows: RawUnified[]) {
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

function parseAmount(v: any) {
  const s = String(v ?? "").replaceAll(",", "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// 연장 셀 포맷 예: "30/계좌이체/20000/26.01.02"
function parseExtendCell(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return { days: 0, amount: 0 };
  const parts = s.split("/");
  const days = Number(String(parts[0] ?? "").trim());
  const amount = parseAmount(parts[2] ?? 0);
  return {
    days: Number.isFinite(days) ? days : 0,
    amount: Number.isFinite(amount) ? amount : 0,
  };
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
    headers.push(`${p.label}_출고수량`, `${p.label}_대여일수`, `${p.label}_금액`);
  }
  headers.push("합계_출고수량", "합계_대여일수", "합계_금액", "비중치");

  const lines = [headers.join(",")];

  for (const r of resp.rows) {
    const row: string[] = [r.pumpModel, r.partnerCategory];
    for (const p of resp.meta.periods) {
      const v = r.values[p.key] || emptyCell();
      row.push(String(v.출고수량), String(v.대여일수), String(v.금액));
    }
    row.push(String(r.sum.출고수량), String(r.sum.대여일수), String(r.sum.금액), String(r.weight));
    lines.push(row.map((x) => `"${String(x).replaceAll(`"`, `""`)}"`).join(","));
  }

  return "\uFEFF" + lines.join("\n");
}

async function loadUnifiedRows(): Promise<RawUnified[]> {
  const r = await query(
    `
    SELECT data
    FROM unified
    WHERE data IS NOT NULL
    `
  );
  return (r.rows || []).map((x: any) => ({ data: x.data || {} }));
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");

  const body = (await req.json().catch(() => null)) as AggregateRunRequest | null;
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

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

  const unifiedRows = await loadUnifiedRows();
  const presentSteps = getPresentSteps(unifiedRows); // 0차 포함 + 실제 존재 차수만
  const periods = makePeriodsFromSteps(presentSteps);
  const rows = makeRowsSkeleton(periods);

  const rowMap = new Map<string, AggregateExtendResultRow>();
  for (const r of rows) {
    rowMap.set(`${r.pumpModel}||${r.partnerCategory}`, r);
  }

  for (const item of unifiedRows) {
    const d = item.data || {};
    const partner = normalizePartnerBucket(d["거래처분류"]);
    if (partner === "조리원") continue;

    const pump = normalizePumpModelName(d["제품"]);

    const startDt = toDateOnly(d["시작일"]);
    const endDt = toDateOnly(d["종료일"]);
    if (!startDt || !endDt) continue;

    for (const step of presentSteps) {
      const key = stepKey(step);
      const cellRaw = d[key];
      const hasStepValue = step === 0 ? true : String(cellRaw ?? "").trim().length > 0;
      if (!hasStepValue) continue;

      const parsed = step === 0 ? { days: overlapDaysInclusive(startDt, endDt, periodStart, periodEnd), amount: 0 } : parseExtendCell(cellRaw);
      if (parsed.days <= 0 && parsed.amount <= 0) continue;

      const target = rowMap.get(`${pump}||${partner}`);
      if (!target) continue;

      const v = target.values[key] || emptyCell();
      v.출고수량 += 1;
      v.대여일수 += parsed.days;
      v.금액 += parsed.amount;
      target.values[key] = v;
    }
  }

  // 소계/합계 계산
  for (const pump of [...PUMP_ORDER].sort((a, b) => pumpOrderIndex(a) - pumpOrderIndex(b))) {
    const subtotal = rowMap.get(`${pump}||소계`);
    if (!subtotal) continue;

    for (const partner of PARTNERS) {
      const r = rowMap.get(`${pump}||${partner}`);
      if (!r) continue;

      r.sum = emptyCell();
      for (const p of periods) addCell(r.sum, r.values[p.key] || emptyCell());

      for (const p of periods) {
        const sv = subtotal.values[p.key] || emptyCell();
        addCell(sv, r.values[p.key] || emptyCell());
        subtotal.values[p.key] = sv;
      }

      subtotal.weight += r.weight;
    }

    subtotal.sum = emptyCell();
    for (const p of periods) addCell(subtotal.sum, subtotal.values[p.key] || emptyCell());
  }

  const response: AggregateRunExtendResponse = {
    ok: true,
    meta: {
      periodStart: periodStartRaw,
      periodEnd: periodEndRaw,
      periods,
    },
    rows,
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

  return NextResponse.json(response);
}