import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";

function resolveAggregateExportInfo(request: AggregateRunRequest) {
  const isPartnerAll =
    request?.필터?.집계타입 === "유축기" &&
    request?.필터?.거래처 === "전체";

  if (isPartnerAll) {
    return {
      url: `/api/aggregate/run-partner-all?format=csv`,
      filename: "aggregate_partner_all.csv",
    };
  }

  return {
    url: `/api/aggregate/run?format=csv`,
    filename: "aggregate_pump_all.csv",
  };
}

export async function downloadAggregateCsv(request: AggregateRunRequest) {
  const info = resolveAggregateExportInfo(request);

  const res = await fetch(info.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) throw new Error("다운로드 실패");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = info.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}