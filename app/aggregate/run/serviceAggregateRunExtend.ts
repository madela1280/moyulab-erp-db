import type { AggregateRunRequest } from "@/aggregate/run/types.aggregateRun";
import type { AggregateRunExtendResponse } from "@/aggregate/run/types.aggregateExtendResult";

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || `HTTP_${res.status}`);
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }

  return data;
}

export async function runAggregateExtend(
  request: AggregateRunRequest
): Promise<AggregateRunExtendResponse> {
  return fetchJson(`/api/aggregate/run-extend`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}