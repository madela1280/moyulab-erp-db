// app/devices/symphony/service/serviceSymphony.ts

export type SymphonyRow = {
  id: number;
  data: Record<string, any>;
  sort_key?: number;
};

type InsertArgs = {
  count: number;
  beforeId: number | null;
  afterId: number | null;
};

type BulkPatchArgs = {
  updates: Array<{ id: number; patch: Record<string, any> }>;
};

type BulkDeleteArgs = {
  ids: number[];
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const r = await fetch(input, init);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `FAILED(${r.status})`);
  }
  return (await r.json()) as T;
}

export async function listSymphonyRows(params?: {
  limit?: number;
  tailData?: 1;
  ids?: number[];
}) {
  const sp = new URLSearchParams();

  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.tailData) sp.set("tailData", "1");
  if (params?.ids?.length) sp.set("ids", params.ids.join(","));

  const qs = sp.toString();
  const url = qs ? `/api/devices/symphony?${qs}` : `/api/devices/symphony`;

  return fetchJson<
    | SymphonyRow[]
    | { rows: SymphonyRow[]; total?: number; baseIndex?: number; count?: number }
  >(url, { cache: "no-store" });
}

export async function getSymphonyRow(id: number) {
  return fetchJson<SymphonyRow>(`/api/devices/symphony/${id}`, { cache: "no-store" });
}

/**
 * 셀 patch(merge)
 * - value === "" 이면 null 저장 규칙은 호출측에서 처리 권장(그리드 onBlur에서)
 */
export async function patchSymphonyRow(id: number, patch: Record<string, any>) {
  return fetchJson<SymphonyRow>(`/api/devices/symphony/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function createSymphonyRow(data: Record<string, any>) {
  return fetchJson<SymphonyRow>(`/api/devices/symphony`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function insertSymphonyRows(args: InsertArgs) {
  return fetchJson<{ ok: true; insertedRows: Array<{ id: number; sort_key?: number }> }>(
    `/api/devices/symphony/insert`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    }
  );
}

export async function bulkPatchSymphony(args: BulkPatchArgs) {
  return fetchJson<{ ok: true; updatedCount: number; updatedIds: number[] }>(
    `/api/devices/symphony/bulk-patch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    }
  );
}

export async function bulkDeleteSymphony(args: BulkDeleteArgs) {
  return fetchJson<{ ok: true; deletedCount: number; deletedIds: number[] }>(
    `/api/devices/symphony/bulk-delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    }
  );
}

export async function exportSymphonyCsv(body: {
  // 1차: 필터 스펙은 추후 확장 (현재는 전체/필터된 것 구분만)
  filter?: any;
}) {
  const r = await fetch(`/api/devices/symphony/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `FAILED(${r.status})`);
  }

  const blob = await r.blob();
  return blob; // UI에서 URL.createObjectURL(blob)로 다운로드 처리
}