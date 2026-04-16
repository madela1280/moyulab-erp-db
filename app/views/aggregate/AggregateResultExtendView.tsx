"use client";

import { useEffect } from "react";
import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";
import { useAggregateRunExtend } from "@/aggregate/run/useAggregateRunExtend";
import { AggregateResultTableExtend } from "@/aggregate/result/AggregateResultTableExtend";
import { downloadAggregateExtendCsv } from "@/aggregate/result/serviceAggregateExtendExport";

export default function AggregateResultExtendView({
  request,
  onBack,
}: {
  request: AggregateRunRequest;
  onBack: () => void;
}) {
  const { loading, error, result, execute } = useAggregateRunExtend();

  useEffect(() => {
    void execute(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b bg-white flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 text-sm rounded border bg-white hover:bg-gray-50"
        >
          조건으로 돌아가기
        </button>

        <button
          type="button"
          onClick={() => downloadAggregateExtendCsv(request)}
          className="px-3 py-1.5 text-sm rounded border bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
          disabled={loading}
        >
          엑셀 다운로드
        </button>

        {loading ? <div className="text-xs text-gray-500">집계 중...</div> : null}
{error ? <div className="text-xs text-red-600">{error}</div> : null}

{result?.compareResults?.length ? (
  <div className="w-full mt-2 text-xs text-gray-700">
    비교: {result.compareResults.map((x: any) => x.label).join(" / ")}
  </div>
) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-3">
        {result ? (
  <AggregateResultTableExtend
    meta={result.meta}
    rows={result.rows}
    compareResults={result.compareResults}
  />
) : (
  <div className="text-xs text-gray-400">집계 결과가 없습니다.</div>
)}
      </div>
    </div>
  );
}