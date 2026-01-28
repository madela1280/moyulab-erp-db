"use client";

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

export async function exportUnifiedCsv(body: { filter?: any }) {
  const payload = {
    filter: normalizeFilterForExport(body?.filter),
  };

  const r = await fetch(`/api/unified/export`, {
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