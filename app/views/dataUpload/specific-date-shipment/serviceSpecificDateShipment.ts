export type SpecificDateShipmentUnifiedSourceRow = {
  id: number;
  data: Record<string, any>;
};

export type FetchSpecificDateShipmentFromUnifiedResponse = {
  ok: boolean;
  message?: string;
  rows: SpecificDateShipmentUnifiedSourceRow[];
};

export async function fetchSpecificDateShipmentFromUnified(): Promise<FetchSpecificDateShipmentFromUnifiedResponse> {
  const r = await fetch(`/api/data-upload/specific-date-shipment/from-unified`, {
    method: "GET",
    cache: "no-store",
  });

  const j = (await r.json().catch(() => null)) as FetchSpecificDateShipmentFromUnifiedResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return {
    ok: Boolean(j?.ok),
    message: j?.message,
    rows: Array.isArray(j?.rows) ? j.rows : [],
  };
}
