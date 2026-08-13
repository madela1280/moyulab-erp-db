export type UnifiedDeviceStatusOptionsResponse = {
  deviceStatusOptions: string[];
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

export async function fetchUnifiedDeviceStatusOptions(): Promise<string[]> {
  const r = await fetch("/api/unified/device-status-options", {
    method: "GET",
    cache: "no-store",
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `FETCH_UNIFIED_DEVICE_STATUS_OPTIONS_FAILED(${r.status})`);
  }

  const j = (await r.json().catch(() => null)) as Partial<UnifiedDeviceStatusOptionsResponse> | null;
  return normalizeOptions(j?.deviceStatusOptions);
}

export async function addUnifiedDeviceStatusOption(name: string): Promise<string[]> {
  const n = normalizeName(name);
  if (!n) return fetchUnifiedDeviceStatusOptions();

  const r = await fetch("/api/unified/device-status-options", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ add: n }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `ADD_UNIFIED_DEVICE_STATUS_OPTION_FAILED(${r.status})`);
  }

  const j = (await r.json().catch(() => null)) as Partial<UnifiedDeviceStatusOptionsResponse> | null;
  return normalizeOptions(j?.deviceStatusOptions);
}

export async function removeUnifiedDeviceStatusOption(name: string): Promise<string[]> {
  const n = normalizeName(name);
  if (!n) return fetchUnifiedDeviceStatusOptions();

  const r = await fetch("/api/unified/device-status-options", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ remove: n }),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `REMOVE_UNIFIED_DEVICE_STATUS_OPTION_FAILED(${r.status})`);
  }

  const j = (await r.json().catch(() => null)) as Partial<UnifiedDeviceStatusOptionsResponse> | null;
  return normalizeOptions(j?.deviceStatusOptions);
}