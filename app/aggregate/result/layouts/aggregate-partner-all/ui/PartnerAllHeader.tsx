"use client";

import type { AggregatePeriodMeta } from "@/aggregate/run/types.aggregateResult";

export default function PartnerAllHeader({
  periods,
}: {
  periods: AggregatePeriodMeta[];
}) {
  return (
    <thead>
      <tr>
        <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap" rowSpan={2}>
          구분
        </th>
        <th className="border px-2 py-1 bg-gray-100 whitespace-nowrap" rowSpan={2}>
          거래처/기종
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
  );
}