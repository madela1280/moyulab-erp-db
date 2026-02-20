// app/views/sms/SmsMainView.tsx
"use client";

import { useEffect, useState } from "react";
import type { SmsSubCategory } from "@/sms/types/sms.types";
import { useSmsTargets } from "@/views/sms/hooks/useSmsTargets";

import SmsSubCategoryTabs from "@/views/sms/components/SmsSubCategoryTabs";
import SmsTargetTable from "@/views/sms/components/SmsTargetTable";

export default function SmsMainView() {
  const [subCategory, setSubCategory] = useState<SmsSubCategory>("대여첫안내");

  const { loading, error, rows, baseDate, counts } = useSmsTargets({
    subCategory,
    aggregateOnMount: false,
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // 데이터가 바뀌면 selection에서 없는 id는 제거
  useEffect(() => {
    const existing = new Set(rows.map((r) => r.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (existing.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [rows]);

  return (
    <div className="w-full h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-gray-800">문자</div>
          <div className="text-xs text-gray-500">
            기준일: <span className="font-mono">{baseDate || "-"}</span>
            {"  "}
            · 총 {counts.total}건
            {"  "}
            {Object.entries(counts.byStatus).length ? (
              <span className="ml-2">
                {Object.entries(counts.byStatus)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(" / ")}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2" />
      </div>

      <SmsSubCategoryTabs value={subCategory} onChange={setSubCategory} />

      {error ? (
        <div className="text-xs text-red-600 border border-red-200 bg-red-50 p-2 rounded">
          {error}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 border rounded bg-white overflow-hidden">
        <SmsTargetTable
          loading={loading}
          rows={rows}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
        />
      </div>
    </div>
  );
}