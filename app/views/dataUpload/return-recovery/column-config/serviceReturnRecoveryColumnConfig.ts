export type ReturnRecoveryGridSettingsResponse = {
  ok: boolean;
  message?: string;
  columnOrder: string[];
};

export async function fetchReturnRecoveryColumnOrder(): Promise<string[]> {
  const r = await fetch("/api/data-upload/return-recovery/grid-settings", {
    method: "GET",
    cache: "no-store",
  });

  const j = (await r.json().catch(() => null)) as ReturnRecoveryGridSettingsResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return Array.isArray(j?.columnOrder) ? j.columnOrder : [];
}

export async function saveReturnRecoveryColumnOrder(columnOrder: string[]): Promise<string[]> {
  const r = await fetch("/api/data-upload/return-recovery/grid-settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ columnOrder }),
  });

  const j = (await r.json().catch(() => null)) as ReturnRecoveryGridSettingsResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return Array.isArray(j?.columnOrder) ? j.columnOrder : [];
}