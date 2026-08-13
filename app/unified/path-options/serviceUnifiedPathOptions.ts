export type UnifiedPathOptionsResponse = {
  pathOptions: string[];
};

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

function normalizeOptions(list: any): string[] {
  if (!Array.isArray(list)) return [];

  return Array.from(
    new Set(
      list
        .map(normalizeName)
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ko"));
}

export async function fetchUnifiedPathOptions(): Promise<string[]> {
  const r = await fetch("/api/unified/path-options", {
    method: "GET",
    cache: "no-store",
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `FETCH_UNIFIED_PATH_OPTIONS_FAILED(${r.status})`);
  }

  const j = (await r.json().catch(() => null)) as Partial<UnifiedPathOptionsResponse> | null;
  return normalizeOptions(j?.pathOptions);
}

export async function addUnifiedPathOption(name: string): Promise<string[]> {
  const n = normalizeName(name);
  if (!n) return fetchUnifiedPathOptions();

  const r = await fetch("/api/unified/path-options", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ add: n }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `ADD_UNIFIED_PATH_OPTION_FAILED(${r.status})`);
  }

  const j = (await r.json().catch(() => null)) as Partial<UnifiedPathOptionsResponse> | null;
  return normalizeOptions(j?.pathOptions);
}

export async function removeUnifiedPathOption(name: string): Promise<string[]> {
  const n = normalizeName(name);
  if (!n) return fetchUnifiedPathOptions();

  const r = await fetch("/api/unified/path-options", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ remove: n }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `REMOVE_UNIFIED_PATH_OPTION_FAILED(${r.status})`);
  }

  const j = (await r.json().catch(() => null)) as Partial<UnifiedPathOptionsResponse> | null;
  return normalizeOptions(j?.pathOptions);
}