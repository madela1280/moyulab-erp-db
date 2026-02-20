"use client";

import { useEffect, useState } from "react";
import type { SmsSubCategory } from "@/sms/types/sms.types";
import { useSmsTargets } from "@/views/sms/hooks/useSmsTargets";

import SmsTargetTable from "@/views/sms/components/SmsTargetTable";

export default function SmsView(props: { initialSubCategory?: SmsSubCategory }) {
  const [subCategory, setSubCategory] = useState<SmsSubCategory>(
    props.initialSubCategory ?? "대여첫안내"
  );

  useEffect(() => {
    if (!props.initialSubCategory) return;
    setSubCategory(props.initialSubCategory);
  }, [props.initialSubCategory]);

  const { loading, rows } = useSmsTargets({
    subCategory,
    aggregateOnMount: false,
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // rows가 바뀌면 selection에서 없는 id는 제거
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
        <div className="text-sm font-semibold text-gray-800">{subCategory}</div>
        <div className="flex items-center gap-2" />
      </div>

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