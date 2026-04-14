import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";
import type {
  AggregateRunExtendResponse,
  AggregateExtendResultRow,
  AggregateExtendPeriodMeta,
} from "@/aggregate/run/types.aggregateExtendResult";

const PUMPS = ["심포니", "락티나", "스윙", "스윙맥시", "프리스타일", "시밀래", "각시밀"];
const PARTNERS = ["온라인", "보건소", "개인", "기타"]; // 조리원 제외

function safeDate(v: any) {
  return String(v ?? "").trim();
}

function makePeriods(req: AggregateRunRequest): AggregateExtendPeriodMeta[] {
  const step = req?.필터?.연장 || "전체";

  if (step === "전체") {
    return [
      { key: "0차연장", label: "0차연장" },
      { key: "1차연장", label: "1차연장" },
    ];
  }

  return [{ key: step, label: step }];
}

function emptyValue() {
  return { 출고수량: 0, 대여일수: 0, 금액: 0 };
}

function buildEmptyRows(periods: AggregateExtendPeriodMeta[]): AggregateExtendResultRow[] {
  const rows: AggregateExtendResultRow[] = [];

  for (const pump of PUMPS) {
    for (const partner of PARTNERS) {
      const values: Record<string, { 출고수량: number; 대여일수: number; 금액: number }> = {};
      for (const p of periods) values[p.key] = emptyValue();

      rows.push({
        pumpModel: pump,
        partnerCategory: partner,
        values,
        sum: emptyValue(),
        weight: 0,
      });
    }

    const subtotalValues: Record<string, { 출고수량: number; 대여일수: number; 금액: number }> = {};
    for (const p of periods) subtotalValues[p.key] = emptyValue();

    rows.push({
      pumpModel: pump,
      partnerCategory: "소계",
      values: subtotalValues,
      sum: emptyValue(),
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
      const v = r.values[p.key] || { 출고수량: 0, 대여일수: 0, 금액: 0 };
      row.push(String(v.출고수량), String(v.대여일수), String(v.금액));
    }
    row.push(String(r.sum.출고수량), String(r.sum.대여일수), String(r.sum.금액), String(r.weight));
    lines.push(row.map((x) => `"${String(x).replaceAll(`"`, `""`)}"`).join(","));
  }

  return "\uFEFF" + lines.join("\n");
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user?.username) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");

  const body = (await req.json().catch(() => null)) as AggregateRunRequest | null;
  if (!body) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

  const periodStart = safeDate(body?.기준일자?.periodStart);
  const periodEnd = safeDate(body?.기준일자?.periodEnd);
  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "INVALID_PERIOD" }, { status: 400 });
  }

  const periods = makePeriods(body);
  const rows = buildEmptyRows(periods);

  const response: AggregateRunExtendResponse = {
    ok: true,
    meta: {
      periodStart,
      periodEnd,
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