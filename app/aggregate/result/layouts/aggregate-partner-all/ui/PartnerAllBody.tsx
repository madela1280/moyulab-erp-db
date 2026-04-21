"use client";

import { Fragment } from "react";
import type { AggregatePeriodMeta } from "@/aggregate/run/types.aggregateResult";
import type { PartnerAllRow } from "../types.partnerAll";
import PartnerAllRowItem from "./PartnerAllRow";
import { buildSectionRowSpans } from "../utils/rowSpan";

export default function PartnerAllBody({
  periods,
  rows,
}: {
  periods: AggregatePeriodMeta[];
  rows: PartnerAllRow[];
}) {
  const rowSpans = buildSectionRowSpans(rows);

  if (!rows.length) {
    return (
      <tbody>
        <tr>
          <td className="border px-2 py-2 text-center text-gray-500" colSpan={2 + periods.length * 3 + 3}>
            결과가 없습니다.
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {rows.map((row, idx) => {
        const showSectionCell = !!row.showSection;
        const sectionRowSpan = rowSpans[idx] || 1;

        return (
          <PartnerAllRowItem
            key={`${row.section}-${row.label}-${idx}`}
            row={row}
            periods={periods}
            showSectionCell={showSectionCell}
            sectionRowSpan={sectionRowSpan}
          />
        );
      })}
    </tbody>
  );
}