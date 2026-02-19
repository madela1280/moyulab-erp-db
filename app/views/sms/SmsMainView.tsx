// app/views/sms/SmsMainView.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { SmsSubCategory } from "@/sms/types/sms.types";
import { useSmsTargets } from "@/views/sms/hooks/useSmsTargets";
import { sendSmsAuto, syncSmsResults } from "@/views/sms/service/serviceSms";

import SmsSubCategoryTabs from "@/views/sms/components/SmsSubCategoryTabs";
import SmsTargetTable from "@/views/sms/components/SmsTargetTable";
import SmsSendPanel from "@/views/sms/components/SmsSendPanel";

export default function SmsMainView() {
  const [subCategory, setSubCategory] = useState<SmsSubCategory>("대여첫안내");

  const { loading, error, rows, baseDate, counts, refresh, aggregateAndRefresh } =
    useSmsTargets({
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

  const selectedCount = selectedIds.size;

  const selectedRows = useMemo(() => {
    if (!selectedCount) return [];
    const set = selectedIds;
    return rows.filter((r) => set.has(r.id));
  }, [rows, selectedIds, selectedCount]);

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

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-xs rounded border bg-white hover:bg-gray-50"
            onClick={() => aggregateAndRefresh()}
            disabled={loading}
            title="(배치) 집계를 다시 만들고 목록을 새로고침"
          >
            집계 실행(05시 배치)
          </button>

          <button
            className="px-3 py-1.5 text-xs rounded border bg-white hover:bg-gray-50"
            onClick={() => refresh()}
            disabled={loading}
            title="목록 새로고침"
          >
            새로고침
          </button>
        </div>
      </div>

      <SmsSubCategoryTabs value={subCategory} onChange={setSubCategory} />

      {error ? (
        <div className="text-xs text-red-600 border border-red-200 bg-red-50 p-2 rounded">
          {error}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">
        <div className="col-span-8 min-h-0 border rounded bg-white overflow-hidden">
          <SmsTargetTable
            loading={loading}
            rows={rows}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
          />
        </div>

        <div className="col-span-4 min-h-0 border rounded bg-white overflow-auto">
          <SmsSendPanel
            subCategory={subCategory}
            baseDate={baseDate}
            selectedRows={selectedRows}
            onSend={async (opts) => {
              const targetIds = opts.scope === "selected" ? Array.from(selectedIds) : undefined;
              const res = await sendSmsAuto({
                subCategory,
                baseDate,
                targetIds,
                dryRun: opts.dryRun,
              });

              // 발송 요청 후 목록 새로고침
              await refresh();
              return res;
            }}
            onSyncResult={async () => {
              const res = await syncSmsResults({ baseDate });
              await refresh();
              return res;
            }}
            onClearSelection={() => setSelectedIds(new Set())}
            selectedCount={selectedCount}
          />
        </div>
      </div>
    </div>
  );
}