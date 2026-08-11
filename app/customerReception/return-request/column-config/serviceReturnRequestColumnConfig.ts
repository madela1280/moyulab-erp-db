export type ReturnRequestGridSettingsResponse = {
  ok: boolean;
  message?: string;
  columnWidths?: Record<string, number>;
};

export type ReturnRequestGridSettings = {
  columnWidths: Record<string, number>;
};

export async function fetchReturnRequestGridSettings(): Promise<ReturnRequestGridSettings> {
  const r = await fetch("/api/customer-reception/return-requests/grid-settings", {
    method: "GET",
    cache: "no-store",
  });

  const j = (await r.json().catch(() => null)) as ReturnRequestGridSettingsResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return {
    columnWidths: j?.columnWidths && typeof j.columnWidths === "object" ? j.columnWidths : {},
  };
}

export async function saveReturnRequestGridSettings(params: {
  columnWidths: Record<string, number>;
}): Promise<ReturnRequestGridSettings> {
  const r = await fetch("/api/customer-reception/return-requests/grid-settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      columnWidths: params.columnWidths,
    }),
  });

  const j = (await r.json().catch(() => null)) as ReturnRequestGridSettingsResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return {
    columnWidths: j?.columnWidths && typeof j.columnWidths === "object" ? j.columnWidths : {},
  };
}