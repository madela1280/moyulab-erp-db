"use client";

import { Fragment } from "react";
import type { AggregatePeriodMeta } from "@/aggregate/run/types.aggregateResult";
import type { PartnerAllRow } from "../types.partnerAll";
import { formatNumber, formatDays } from "../utils/format";

function rowClassName(rowType: PartnerAllRow["rowType"]) {
  if (rowType === "subtotal") return "bg-gray-100 font-semibold";
  if (rowType === "grandTotal") return "bg-amber-50 font-semibold border-t-2 border-gray-500";
  return "";
}

export default function PartnerAllRowItem({
  row,
  periods,
  showSectionCell,
  sectionRowSpan,
}: {
  row: PartnerAllRow;
  periods: AggregatePeriodMeta[];
  showSectionCell: boolean;
  sectionRowSpan: number;
}) {
  return (
    <tr className={rowClassName(row.rowType)}>
      {showSectionCell ? (
        <td className="border px-2 py-1 whitespace-nowrap align-top" rowSpan={sectionRowSpan}>
          {row.section}
        </td>
      ) : null}

      <td className="border px-2 py-1 whitespace-nowrap">{row.label}</td>

      {periods.map((p) => {
        const v = row.values?.[p.key] || { 출고: 0, 대여일수: 0, 금액: 0 };
        return (
          <Fragment key={`${row.section}-${row.label}-${p.key}`}>
            <td className="border px-1 py-1 text-right">{formatNumber(v.출고)}</td>
            <td className="border px-1 py-1 text-right">{formatDays(v.대여일수)}</td>
            <td className="border px-2 py-1 text-right">{formatNumber(v.금액)}</td>
          </Fragment>
        );
      })}

      <td className="border px-1 py-1 text-right">{formatNumber(row.sum?.출고)}</td>
      <td className="border px-1 py-1 text-right">{formatDays(row.sum?.대여일수)}</td>
      <td className="border px-2 py-1 text-right">{formatNumber(row.sum?.금액)}</td>
    </tr>
  );
}