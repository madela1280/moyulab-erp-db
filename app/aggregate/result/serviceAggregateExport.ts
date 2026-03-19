import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";

export async function downloadAggregateCsv(request: AggregateRunRequest) {
  const res = await fetch(`/api/aggregate/run?format=csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) throw new Error("다운로드 실패");

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "aggregate_pump_all.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}