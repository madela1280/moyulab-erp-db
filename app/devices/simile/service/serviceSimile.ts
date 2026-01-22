import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";

export type SimileRow = {
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

export async function listSimileRows(params?: {
  limit?: number;
  tailData?: 1;
  ids?: number[];
}) {
  const sp = new URLSearchParams();

  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.tailData) sp.set("tailData", "1");
  if (params?.ids?.length) sp.set("ids", params.ids.join(","));

  const qs = sp.toString();
  const url = qs ? `/api/devices/simile?${qs}` : `/api/devices/simile`;

  return fetchJson<
    | SimileRow[]
    | { rows: SimileRow[]; total?: number; baseIndex?: number; count?: number }
  >(url, { cache: "no-store" });
}

export async function getSimileRow(id: number) {
  return fetchJson<SimileRow>(`/api/devices/simile/${id}`, { cache: "no-store" });
}

/**
 * 셀 patch(merge)
 * - value === "" 이면 null 저장 규칙은 호출측에서 처리(그리드 onBlur)
 */
export async function patchSimileRow(id: number, patch: Record<string, any>) {
  const res = await fetchJson<SimileRow>(`/api/devices/simile/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  // ✅ 다른 탭/PC에 변경 알림(공용 unified:update 재사용)
  syncEmitUnifiedUpdate();

  return res;
}

export async function createSimileRow(data: Record<string, any>) {
  const res = await fetchJson<SimileRow>(`/api/devices/simile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  syncEmitUnifiedUpdate();
  return res;
}

export async function insertSimileRows(args: InsertArgs) {
  const res = await fetchJson<{ ok: true; insertedRows: Array<{ id: number; sort_key?: number }> }>(
    `/api/devices/simile/insert`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    }
  );

  syncEmitUnifiedUpdate();
  return res;
}

export async function bulkPatchSimile(args: BulkPatchArgs) {
  const res = await fetchJson<{ ok: true; updatedCount: number; updatedIds: number[] }>(
    `/api/devices/simile/bulk-patch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    }
  );

  syncEmitUnifiedUpdate();
  return res;
}

export async function bulkDeleteSimile(args: BulkDeleteArgs) {
  const res = await fetchJson<{ ok: true; deletedCount: number; deletedIds: number[] }>(
    `/api/devices/simile/bulk-delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    }
  );

  syncEmitUnifiedUpdate();
  return res;
}

// ✅ Set은 JSON으로 전송 시 깨지므로(Array로 변환) export 요청용으로 정규화
function normalizeFilterForExport(filter: any) {
  if (!filter || typeof filter !== "object") return {};

  const filterState = filter.filterState ?? {};
  const sortState = filter.sortState ?? {};

  const selectedByKeyRaw = filterState.selectedByKey ?? {};
  const selectedByKey: Record<string, string[]> = {};

  if (selectedByKeyRaw && typeof selectedByKeyRaw === "object") {
    for (const [k, v] of Object.entries(selectedByKeyRaw)) {
      if (v instanceof Set) {
        selectedByKey[k] = Array.from(v).map(String);
      } else if (Array.isArray(v)) {
        selectedByKey[k] = v.map(String);
      }
    }
  }

  const searchByKeyRaw = filterState.searchByKey ?? {};
  const searchByKey: Record<string, string> = {};
  if (searchByKeyRaw && typeof searchByKeyRaw === "object") {
    for (const [k, v] of Object.entries(searchByKeyRaw)) {
      searchByKey[k] = String(v ?? "");
    }
  }

  return {
    filterState: { selectedByKey, searchByKey },
    sortState: {
      key: sortState?.key ?? null,
      dir: sortState?.dir === "desc" ? "desc" : "asc",
    },
  };
}

export async function exportSimileCsv(body: { filter?: any }) {
  const payload = {
    filter: normalizeFilterForExport(body?.filter),
  };

  const r = await fetch(`/api/devices/simile/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `FAILED(${r.status})`);
  }

  const blob = await r.blob();
  return blob;
}