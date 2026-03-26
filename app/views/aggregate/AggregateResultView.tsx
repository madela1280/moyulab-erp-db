"use client";

import { useEffect } from "react";
import { useAggregateRun } from "@/aggregate/run/useAggregateRun";
import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";
import { AggregateResultTable } from "@/aggregate/result/AggregateResultTable";
import { downloadAggregateCsv } from "@/aggregate/result/serviceAggregateExport";

export default function AggregateResultView({
  request,
  onBack,
}: {
  request: AggregateRunRequest;
  onBack: () => void;
}) {
  const { loading, error, result, execute } = useAggregateRun();

  useEffect(() => {
    void execute(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
  <div className="w-full h-full flex flex-col overflow-hidden">
    <div className="px-4 py-3 border-b bg-white flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50"
      >
        조건으로 돌아가기
      </button>

      <button
        type="button"
        onClick={() => downloadAggregateCsv(request)}
        className="px-3 py-1.5 text-sm rounded border bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
        disabled={loading}
      >
        엑셀 다운로드
      </button>

      {loading ? <div className="text-xs text-gray-500">집계 중...</div> : null}
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
    </div>

    <div className="flex-1 min-h-0 overflow-auto p-3">
      {result ? (
        <AggregateResultTable
          meta={result.meta}
          rows={result.rows}
          compareResults={result.compareResults}
          deviceRows={result.deviceRows}
        />
      ) : (
        <div className="text-xs text-gray-400">집계 결과가 없습니다.</div>
      )}
    </div>
  </div>
);
}