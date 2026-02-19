"use client";

import { useEffect, useMemo, useState } from "react";
import type { SmsSubCategory } from "@/sms/types/sms.types";
import { useSmsTargets } from "@/views/sms/hooks/useSmsTargets";
import { sendSmsAuto, syncSmsResults } from "@/views/sms/service/serviceSms";

import SmsTargetTable from "@/views/sms/components/SmsTargetTable";
import SmsSendPanel from "@/views/sms/components/SmsSendPanel";

export default function SmsView(props: { initialSubCategory?: SmsSubCategory }) {
  const [subCategory, setSubCategory] = useState<SmsSubCategory>(
    props.initialSubCategory ?? "대여첫안내"
  );

  useEffect(() => {
    if (!props.initialSubCategory) return;
    setSubCategory(props.initialSubCategory);
  }, [props.initialSubCategory]);

  const { loading, rows, baseDate, refresh } = useSmsTargets({
    subCategory,
    aggregateOnMount: false,
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showVerifyPanel, setShowVerifyPanel] = useState(false);

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

  const selectedCount = selectedIds.size;

  const selectedRows = useMemo(() => {
    if (!selectedCount) return [];
    const set = selectedIds;
    return rows.filter((r) => set.has(r.id));
  }, [rows, selectedIds, selectedCount]);

  async function runIncrementalAggregateThenRefresh() {
    // ✅ 새로고침 = (증분 집계 1회) + (목록 다시조회)
    // - UI에 에러를 노출하지 않는 정책(요구사항)이라, 실패 시 콘솔만 찍고 refresh는 수행
    try {
      await fetch("/api/sms/aggregate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseDate: baseDate || undefined,
          mode: "incremental",
        }),
      });
    } catch (e) {
      console.error("incremental aggregate failed:", e);
    } finally {
      await refresh();
    }
  }

  return (
    <div className="w-full h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-800">{subCategory}</div>

        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-xs rounded border bg-white hover:bg-gray-50"
            onClick={() => {
              void runIncrementalAggregateThenRefresh();
            }}
            disabled={loading}
            title="(05시 집계 이후 변경분) 증분 집계 반영 + 목록 새로고침"
          >
            새로고침
          </button>

          <button
            className="px-3 py-1.5 text-xs rounded border bg-gray-900 text-white hover:bg-black disabled:opacity-50"
            onClick={() => setShowVerifyPanel((v) => !v)}
            disabled={loading}
            title="검증/발송 패널 열기/닫기"
          >
            검증
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-12 gap-3">
        <div
          className={
            (showVerifyPanel ? "col-span-8" : "col-span-12") +
            " min-h-0 border rounded bg-white overflow-hidden"
          }
        >
          <SmsTargetTable
            loading={loading}
            rows={rows}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
          />
        </div>

        {showVerifyPanel && (
          <div className="col-span-4 min-h-0 border rounded bg-white overflow-auto">
            <SmsSendPanel
              subCategory={subCategory}
              baseDate={baseDate}
              selectedRows={selectedRows}
              selectedCount={selectedCount}
              onSend={async (opts) => {
                const targetIds =
                  opts.scope === "selected" ? Array.from(selectedIds) : undefined;

                const res = await sendSmsAuto({
                  subCategory,
                  baseDate,
                  targetIds,
                  dryRun: opts.dryRun,
                });

                await refresh();
                return res;
              }}
              onSyncResult={async () => {
                const res = await syncSmsResults({ baseDate });
                await refresh();
                return res;
              }}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          </div>
        )}
      </div>
    </div>
  );
}