"use client";

import { Fragment } from "react";

type CompareMetric = {
  current: number;
  compare: number;
  delta: number;
  max: number;
};

export type AggregateSubtotalComparePeriod = {
  key: string;
  출고수량: CompareMetric;
  대여일수: CompareMetric;
  금액: CompareMetric;
};

export type AggregateSubtotalCompareRowProps = {
  compareLabel: string;
  periods: AggregateSubtotalComparePeriod[];
  sum: {
    출고수량: CompareMetric;
    대여일수: CompareMetric;
    금액: CompareMetric;
  };
};

function toSafeNumber(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value: number | null | undefined) {
  return toSafeNumber(value).toLocaleString("ko-KR");
}

function formatSignedNumber(value: number | null | undefined) {
  const n = toSafeNumber(value);
  if (n > 0) return `+${n.toLocaleString("ko-KR")}`;
  return n.toLocaleString("ko-KR");
}

function getDeltaTextColor(delta: number) {
  if (delta > 0) return "text-blue-600";
  if (delta < 0) return "text-red-600";
  return "text-gray-500";
}

function getBarFillColor(kind: "current" | "compare") {
  return kind === "current" ? "bg-blue-500" : "bg-gray-400";
}

function calcHeightPercent(value: number, max: number) {
  const safeValue = toSafeNumber(value);
  const safeMax = toSafeNumber(max);

  if (safeValue <= 0 || safeMax <= 0) return 0;

  const raw = (safeValue / safeMax) * 100;
  return Math.max(10, Math.min(100, raw));
}

function LegendDot({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-sm ${colorClass}`} />
      <span>{label}</span>
    </span>
  );
}

function MiniCompareBarCell({
  metric,
  compact = false,
}: {
  metric: CompareMetric;
  compact?: boolean;
}) {
  const current = toSafeNumber(metric.current);
  const compare = toSafeNumber(metric.compare);
  const delta = toSafeNumber(metric.delta);
  const max = toSafeNumber(metric.max);

  const currentHeight = calcHeightPercent(current, max);
  const compareHeight = calcHeightPercent(compare, max);

  return (
    <div
      className={`relative mx-auto ${compact ? "h-[62px]" : "h-[66px]"} w-full min-w-[44px]`}
      title={`기준 ${formatNumber(current)} / 비교 ${formatNumber(compare)} / 차이 ${formatSignedNumber(delta)}`}
    >
      <div
        className={`absolute left-1/2 top-0 -translate-x-1/2 truncate text-center font-semibold leading-none ${getDeltaTextColor(
          delta
        )} ${compact ? "text-[9px]" : "text-[10px]"}`}
        style={{ maxWidth: "70%" }}
      >
        {formatSignedNumber(delta)}
      </div>

      <div className="absolute inset-x-1 bottom-4 top-4 flex items-end justify-center gap-1">
        <div className="flex h-full w-[35%] items-end justify-center">
          <div
            className={`w-full rounded-t ${getBarFillColor("current")}`}
            style={{ height: `${currentHeight}%`, minHeight: current > 0 ? 4 : 0 }}
          />
        </div>

        <div className="flex h-full w-[35%] items-end justify-center">
          <div
            className={`w-full rounded-t ${getBarFillColor("compare")}`}
            style={{ height: `${compareHeight}%`, minHeight: compare > 0 ? 4 : 0 }}
          />
        </div>
      </div>

      <div className="absolute inset-x-1 bottom-0 flex justify-center gap-1 text-[9px] leading-none text-gray-500">
        <span className="w-[35%] text-center">기준</span>
        <span className="w-[35%] text-center">비교</span>
      </div>
    </div>
  );
}

export default function AggregateSubtotalCompareRow({
  compareLabel,
  periods,
  sum,
}: AggregateSubtotalCompareRowProps) {
  return (
    <tr className="bg-sky-50/40">
      <td className="border px-3 py-2 align-top" colSpan={2}>
        <div className="text-[11px] font-semibold text-gray-800">비교그래프</div>
        <div className="mt-0.5 text-[10px] text-gray-600">{compareLabel}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-gray-500">
          <LegendDot colorClass="bg-blue-500" label="기준" />
          <LegendDot colorClass="bg-gray-400" label="비교" />
        </div>
      </td>

      {periods.map((period) => (
        <Fragment key={period.key}>
          <td className="border px-1 py-1 align-middle">
            <MiniCompareBarCell metric={period.출고수량} />
          </td>
          <td className="border px-1 py-1 align-middle">
            <MiniCompareBarCell metric={period.대여일수} />
          </td>
          <td className="border px-1 py-1 align-middle">
            <MiniCompareBarCell metric={period.금액} />
          </td>
        </Fragment>
      ))}

      <td className="border px-1 py-1 align-middle bg-sky-100/40">
        <MiniCompareBarCell metric={sum.출고수량} compact />
      </td>
      <td className="border px-1 py-1 align-middle bg-sky-100/40">
        <MiniCompareBarCell metric={sum.대여일수} compact />
      </td>
      <td className="border px-1 py-1 align-middle bg-sky-100/40">
        <MiniCompareBarCell metric={sum.금액} compact />
      </td>
    </tr>
  );
}