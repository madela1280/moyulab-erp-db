"use client";

import { Fragment } from "react";
import type { AggregatePeriodMeta } from "@/aggregate/run/types.aggregateResult";

export type DeviceCellValue = {
  출고: number;
  대여일수: number;
  금액: number;
};

export type DeviceResultRow = {
  rowType: "device" | "subtotal" | "grandTotal" | "bottomPurchase" | "bottomRental" | "bottomSum";
  partnerCategory: string;
  deviceNo: string;
  values: Record<string, DeviceCellValue>;
  sum: DeviceCellValue;
};

export type DeviceResultBlock = {
  pumpModel: string;
  rows: DeviceResultRow[];
};

function formatNumber(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("ko-KR");
}

function formatDays(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return Math.round(v).toLocaleString("ko-KR");
}

function buildPartnerRowSpans(rows: DeviceResultRow[]) {
  const spans: Record<number, number> = {};
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r.rowType !== "device") {
      i += 1;
      continue;
    }
    const partner = r.partnerCategory;
    let j = i;
    while (j < rows.length && rows[j].rowType === "device" && rows[j].partnerCategory === partner) {
      j += 1;
    }
    spans[i] = j - i;
    i = j;
  }
  return spans;
}

function rowClassByType(t: DeviceResultRow["rowType"]) {
  if (t === "subtotal") return "bg-gray-100";
  if (t === "grandTotal") return "bg-gray-50 font-semibold border-t-[3px] border-gray-500";
  if (t === "bottomPurchase" || t === "bottomRental" || t === "bottomSum") {
    return "bg-amber-50 font-semibold border-t-[3px] border-amber-400";
  }
  return "";
}

function rowLabelByType(t: DeviceResultRow["rowType"]) {
  if (t === "subtotal") return "소계";
  if (t === "grandTotal") return "합계";
  if (t === "bottomPurchase") return "구매";
  if (t === "bottomRental") return "렌탈";
  if (t === "bottomSum") return "합계";
  return "";
}

export default function AggregateResultTableByDevice({
  title,
  periods,
  blocks,
}: {
  title?: string;
  periods: AggregatePeriodMeta[];
  blocks: DeviceResultBlock[];
}) {
  return (
    <div className="space-y-4">
      {title ? <div className="text-sm font-semibold">{title}</div> : null}

      {blocks.map((block, blockIdx) => {
        const partnerSpans = buildPartnerRowSpans(block.rows);

        return (
          <div key={`${block.pumpModel}-${blockIdx}`} className="overflow-auto border rounded bg-white">
            <div className="px-3 py-2 text-sm font-semibold border-b bg-gray-50">{block.pumpModel}</div>

            <table className="w-max min-w-full border-collapse table-auto text-xs">
              <thead>
                <tr>
                  <th className="border px-3 py-1 bg-gray-100 whitespace-nowrap min-w-[80px]" rowSpan={2}>
                    거래처
                  </th>
                  <th className="border px-3 py-1 bg-gray-100 whitespace-nowrap min-w-[80px]" rowSpan={2}>
                    기기번호
                  </th>
                  {periods.map((p) => (
                    <th key={p.key} className="border px-2 py-1 bg-gray-100 whitespace-nowrap" colSpan={3}>
                      {p.label}
                    </th>
                  ))}
                  <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap" colSpan={3}>
                    합계
                  </th>
                </tr>
                <tr>
                  {periods.flatMap((p) => [
                    <th key={`${p.key}-out`} className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">
                      출고수량
                    </th>,
                    <th key={`${p.key}-days`} className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">
                      대여일수
                    </th>,
                    <th key={`${p.key}-amt`} className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">
                      금액
                    </th>,
                  ])}
                  <th className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">출고수량</th>
                  <th className="border px-1 py-1 bg-gray-100 whitespace-nowrap min-w-[56px]">대여일수</th>
                  <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap min-w-[72px]">금액</th>
                </tr>
              </thead>

              <tbody>
                {block.rows.map((r, idx) => {
                  const showPartnerCell = partnerSpans[idx] && r.rowType === "device";
                  const rowSpan = partnerSpans[idx] || 0;
                  const cls = rowClassByType(r.rowType);

                  const isTotalLike =
                    r.rowType === "grandTotal" ||
                    r.rowType === "bottomPurchase" ||
                    r.rowType === "bottomRental" ||
                    r.rowType === "bottomSum";

                  const tdBase = isTotalLike ? "border px-3 py-[6px] whitespace-nowrap" : "border px-3 py-1 whitespace-nowrap";
                  const tdNum = isTotalLike ? "border px-1 py-[6px] text-right" : "border px-1 py-1 text-right";
                  const tdAmt = isTotalLike ? "border px-2 py-[6px] text-right" : "border px-2 py-1 text-right";

                  return (
                    <tr key={`${block.pumpModel}-${idx}`} className={cls}>
                      {r.rowType === "device" ? (
                        <>
                          {showPartnerCell ? (
                            <td
                              className={`${tdBase} align-top`}
                              rowSpan={rowSpan}
                            >
                              {r.partnerCategory}
                            </td>
                          ) : null}
                          <td className={tdBase}>{r.deviceNo}</td>
                        </>
                      ) : (
                        <>
                          <td className={tdBase}>{r.partnerCategory || rowLabelByType(r.rowType)}</td>
                          <td className={tdBase}>{rowLabelByType(r.rowType)}</td>
                        </>
                      )}

                      {periods.map((p) => {
                        const v = r.values[p.key] || { 출고: 0, 대여일수: 0, 금액: 0 };
                        return (
                          <Fragment key={`${block.pumpModel}-${idx}-${p.key}`}>
                            <td className={tdNum}>{formatNumber(v.출고)}</td>
                            <td className={tdNum}>{formatDays(v.대여일수)}</td>
                            <td className={tdAmt}>{formatNumber(v.금액)}</td>
                          </Fragment>
                        );
                      })}

                      <td className={tdNum}>{formatNumber(r.sum.출고)}</td>
                      <td className={tdNum}>{formatDays(r.sum.대여일수)}</td>
                      <td className={tdAmt}>{formatNumber(r.sum.금액)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}