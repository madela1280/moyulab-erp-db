// app/devices/symphony/service/serviceSymphony.ts

import { syncEmitUnifiedUpdate } from "@/global-sync/sync-engine";

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
 * - value === "" 이면 null 저장 규칙은 호출측에서 처리(그리드 onBlur)
 */
export async function patchSymphonyRow(id: number, patch: Record<string, any>) {
  const res = await fetchJson<SymphonyRow>(`/api/devices/symphony/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

  // ✅ 다른 탭/PC에 변경 알림(코어 unified:update 재사용)
  syncEmitUnifiedUpdate();

  return res;
}

export async function createSymphonyRow(data: Record<string, any>) {
  const res = await fetchJson<SymphonyRow>(`/api/devices/symphony`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  // ✅ 다른 탭/PC에 변경 알림
  syncEmitUnifiedUpdate();

  return res;
}

export async function insertSymphonyRows(args: InsertArgs) {
  const res = await fetchJson<{ ok: true; insertedRows: Array<{ id: number; sort_key?: number }> }>(
    `/api/devices/symphony/insert`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    }
  );

  // ✅ 다른 탭/PC에 변경 알림
  syncEmitUnifiedUpdate();

  return res;
}

export async function bulkPatchSymphony(args: BulkPatchArgs) {
  const res = await fetchJson<{ ok: true; updatedCount: number; updatedIds: number[] }>(
    `/api/devices/symphony/bulk-patch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    }
  );

  // ✅ 다른 탭/PC에 변경 알림
  syncEmitUnifiedUpdate();

  return res;
}

export async function bulkDeleteSymphony(args: BulkDeleteArgs) {
  const res = await fetchJson<{ ok: true; deletedCount: number; deletedIds: number[] }>(
    `/api/devices/symphony/bulk-delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    }
  );

  // ✅ 다른 탭/PC에 변경 알림
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

export async function exportSymphonyCsv(body: { filter?: any }) {
  const payload = {
    filter: normalizeFilterForExport(body?.filter),
  };

  const r = await fetch(`/api/devices/symphony/export`, {
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