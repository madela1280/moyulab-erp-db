// app/api/market-sales/diag-crosscheck/route.ts
//
// 진단 전용(수동 호출) — 쿠팡 API를 그 자리에서 다시 호출해 집계한 값과 market_sales_data(DB)에
// 저장된 값을 날짜/옵션ID 단위로 대조한다. 이미 떠 있는 erp 프로세스 안에서 실행되므로
// 비밀키를 별도로 추출/노출할 필요가 없다. 정기 크론에는 포함하지 않는다.
//
// 사용: POST { channel: "coupang_jcompany", dates: ["2026-10-31","2026-11-01"] }

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  getCoupangCredentials,
  fetchCoupangRevenueHistory,
  fetchCoupangRocketGrowthOrders,
} from "@/api/market-sales/_lib/coupangApiClient";
import { isMarketSalesChannel } from "@/api/market-sales/_lib/marketSalesChannels";
import { addDaysToYYYYMMDD, epochMsToKstDateString } from "@/api/market-sales/_lib/marketSalesDate";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const channel = body?.channel;
  const dates: string[] = Array.isArray(body?.dates) ? body.dates : [];

  if (!isMarketSalesChannel(channel)) return NextResponse.json({ error: "INVALID_CHANNEL" }, { status: 400 });
  if (!dates.length) return NextResponse.json({ error: "NO_DATES" }, { status: 400 });

  const creds = getCoupangCredentials(channel);
  if (!creds) return NextResponse.json({ error: "CREDENTIALS_NOT_CONFIGURED" }, { status: 400 });

  const results: any[] = [];

  for (const date of dates) {
    const rh = await fetchCoupangRevenueHistory(creds, date, date);
    const rhAgg = new Map<string, { qty: number; amt: number }>();
    let refundCount = 0;
    // ✅ 진단용 — recognitionDate(조회기준)와 실제 saleDate가 얼마나 차이나는지 확인용.
    const rhSaleDates: { orderId: number; saleType: string; saleDate: string; recognitionDate: string }[] = [];
    if (rh.ok) {
      for (const e of rh.entries) {
        rhSaleDates.push({ orderId: e.orderId, saleType: e.saleType, saleDate: e.saleDate, recognitionDate: e.recognitionDate });
        if (e.saleType !== "SALE") {
          refundCount++;
          continue;
        }
        for (const it of e.items) {
          const prev = rhAgg.get(it.vendorItemId) || { qty: 0, amt: 0 };
          prev.qty += it.quantity;
          prev.amt += it.saleAmount;
          rhAgg.set(it.vendorItemId, prev);
        }
      }
    }

    const fromDate = addDaysToYYYYMMDD(date, -1); // 이미 YYYYMMDD 형식
    const toDate = addDaysToYYYYMMDD(date, 1);
    const rg = await fetchCoupangRocketGrowthOrders(creds, fromDate, toDate);
    const rgAgg = new Map<string, { qty: number; amt: number }>();
    let rgEntriesTotal = 0;
    let rgEntriesForDate = 0;
    if (rg.ok) {
      rgEntriesTotal = rg.entries.length;
      for (const e of rg.entries) {
        if (epochMsToKstDateString(e.paidAt) !== date) continue;
        rgEntriesForDate++;
        for (const it of e.orderItems) {
          const prev = rgAgg.get(it.vendorItemId) || { qty: 0, amt: 0 };
          prev.qty += it.salesQuantity;
          prev.amt += it.salesQuantity * it.unitSalesPrice;
          rgAgg.set(it.vendorItemId, prev);
        }
      }
    }

    const dbRes = await query(
      `SELECT external_id, item_code, qty, unit_price, total_amt, ecount_status FROM market_sales_data WHERE channel = $1 AND sale_date = $2 ORDER BY external_id`,
      [channel, date]
    );
    const dbByExternalId = new Map(dbRes.rows.map((r: any) => [r.external_id, r]));

    const salesCompare = Array.from(rhAgg.entries()).map(([id, agg]) => {
      const externalId = `${date}:${id}`;
      const dbRow: any = dbByExternalId.get(externalId);
      return {
        vendorItemId: id,
        apiQty: agg.qty,
        apiAmt: agg.amt,
        dbQty: dbRow ? Number(dbRow.qty) : null,
        dbTotalAmt: dbRow ? Number(dbRow.total_amt) : null,
        missingInDb: !dbRow,
      };
    });

    const rocketCompare = Array.from(rgAgg.entries()).map(([id, agg]) => {
      const externalId = `RG:${date}:${id}`;
      const dbRow: any = dbByExternalId.get(externalId);
      return {
        vendorItemId: id,
        apiQty: agg.qty,
        apiAmt: agg.amt,
        dbQty: dbRow ? Number(dbRow.qty) : null,
        dbTotalAmt: dbRow ? Number(dbRow.total_amt) : null,
        missingInDb: !dbRow,
      };
    });

    results.push({
      date,
      revenueHistory: { ok: rh.ok, reason: rh.ok ? undefined : rh.reason, refundCount, itemTypeCount: rhAgg.size, rawEntries: rhSaleDates },
      rocketGrowth: { ok: rg.ok, reason: rg.ok ? undefined : rg.reason, entriesInRange: rgEntriesTotal, entriesForDate: rgEntriesForDate, itemTypeCount: rgAgg.size },
      dbRowCount: dbRes.rows.length,
      salesCompare,
      rocketCompare,
    });
  }

  return NextResponse.json({ ok: true, channel, results });
}
