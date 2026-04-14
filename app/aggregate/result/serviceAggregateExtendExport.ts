import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";

export async function downloadAggregateExtendCsv(request: AggregateRunRequest) {
  const res = await fetch(`/api/aggregate/run-extend?format=csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    cache: "no-store",
  });

  if (!res.ok) throw new Error("다운로드 실패");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "aggregate_extend.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}