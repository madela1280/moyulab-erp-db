import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";

export async function downloadAggregatePartnerAllCsv(request: AggregateRunRequest) {
  const res = await fetch(`/api/aggregate/run-partner-all?format=csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new Error("다운로드 실패");
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "aggregate_partner_all.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}