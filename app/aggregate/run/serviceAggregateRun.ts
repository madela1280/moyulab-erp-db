import type { AggregateRunRequest } from "./types.aggregateRun";
import type { AggregateRunResponse } from "./types.aggregateResult";

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

function resolveAggregateRunEndpoint(request: AggregateRunRequest) {
  const isPartnerAll =
    request?.필터?.집계타입 === "유축기" &&
    request?.필터?.거래처 === "전체";

  return isPartnerAll ? `/api/aggregate/run-partner-all` : `/api/aggregate/run`;
}

export async function runAggregate(request: AggregateRunRequest): Promise<AggregateRunResponse> {
  return fetchJson(resolveAggregateRunEndpoint(request), {
    method: "POST",
    body: JSON.stringify(request),
  });
}