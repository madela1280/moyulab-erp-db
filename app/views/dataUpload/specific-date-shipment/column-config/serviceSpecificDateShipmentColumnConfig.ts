export type SpecificDateShipmentGridSettingsResponse = {
  ok: boolean;
  message?: string;
  columnOrder: string[];
  columnWidths?: Record<string, number>;
};

export type SpecificDateShipmentGridSettings = {
  columnOrder: string[];
  columnWidths: Record<string, number>;
};

export async function fetchSpecificDateShipmentGridSettings(): Promise<SpecificDateShipmentGridSettings> {
  const r = await fetch("/api/data-upload/specific-date-shipment/grid-settings", {
    method: "GET",
    cache: "no-store",
  });

  const j = (await r.json().catch(() => null)) as SpecificDateShipmentGridSettingsResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return {
    columnOrder: Array.isArray(j?.columnOrder) ? j.columnOrder : [],
    columnWidths: j?.columnWidths && typeof j.columnWidths === "object" ? j.columnWidths : {},
  };
}

export async function saveSpecificDateShipmentGridSettings(params: {
  columnOrder: string[];
  columnWidths: Record<string, number>;
}): Promise<SpecificDateShipmentGridSettings> {
  const r = await fetch("/api/data-upload/specific-date-shipment/grid-settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      columnOrder: params.columnOrder,
      columnWidths: params.columnWidths,
    }),
  });

  const j = (await r.json().catch(() => null)) as SpecificDateShipmentGridSettingsResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return {
    columnOrder: Array.isArray(j?.columnOrder) ? j.columnOrder : [],
    columnWidths: j?.columnWidths && typeof j.columnWidths === "object" ? j.columnWidths : {},
  };
}
