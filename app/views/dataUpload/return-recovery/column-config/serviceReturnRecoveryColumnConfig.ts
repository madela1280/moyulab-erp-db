export type ReturnRecoveryGridSettingsResponse = {
  ok: boolean;
  message?: string;
  columnOrder: string[];
  columnWidths?: Record<string, number>;
};

export type ReturnRecoveryGridSettings = {
  columnOrder: string[];
  columnWidths: Record<string, number>;
};

export async function fetchReturnRecoveryGridSettings(): Promise<ReturnRecoveryGridSettings> {
  const r = await fetch("/api/data-upload/return-recovery/grid-settings", {
    method: "GET",
    cache: "no-store",
  });

  const j = (await r.json().catch(() => null)) as ReturnRecoveryGridSettingsResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return {
    columnOrder: Array.isArray(j?.columnOrder) ? j.columnOrder : [],
    columnWidths: j?.columnWidths && typeof j.columnWidths === "object" ? j.columnWidths : {},
  };
}

export async function saveReturnRecoveryGridSettings(params: {
  columnOrder: string[];
  columnWidths: Record<string, number>;
}): Promise<ReturnRecoveryGridSettings> {
  const r = await fetch("/api/data-upload/return-recovery/grid-settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      columnOrder: params.columnOrder,
      columnWidths: params.columnWidths,
    }),
  });

  const j = (await r.json().catch(() => null)) as ReturnRecoveryGridSettingsResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return {
    columnOrder: Array.isArray(j?.columnOrder) ? j.columnOrder : [],
    columnWidths: j?.columnWidths && typeof j.columnWidths === "object" ? j.columnWidths : {},
  };
}