import type { SpecificDateShipmentColumn } from "@/views/dataUpload/specific-date-shipment/columns";

export type SpecificDateShipmentInsertPosition = "after" | "before";

export type SpecificDateShipmentTemplateResponse = {
  ok: boolean;
  message?: string;
  column?: SpecificDateShipmentColumn;
  columns?: SpecificDateShipmentColumn[];
  key?: string;
};

export async function fetchSpecificDateShipmentCustomColumns(): Promise<SpecificDateShipmentColumn[]> {
  const r = await fetch("/api/data-upload/specific-date-shipment/columns", {
    method: "GET",
    cache: "no-store",
  });

  const j = (await r.json().catch(() => null)) as SpecificDateShipmentTemplateResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return Array.isArray(j?.columns) ? j.columns : [];
}

export async function addSpecificDateShipmentCustomColumn(params: {
  label: string;
  referenceKey: string;
  position: SpecificDateShipmentInsertPosition;
  width?: number;
}): Promise<SpecificDateShipmentColumn[]> {
  const r = await fetch("/api/data-upload/specific-date-shipment/columns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      label: params.label,
      referenceKey: params.referenceKey,
      position: params.position,
      width: params.width ?? 140,
    }),
  });

  const j = (await r.json().catch(() => null)) as SpecificDateShipmentTemplateResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return Array.isArray(j?.columns) ? j.columns : [];
}

export async function deleteSpecificDateShipmentCustomColumn(key: string): Promise<string> {
  const columnKey = String(key || "").trim();

  const r = await fetch(`/api/data-upload/specific-date-shipment/columns/${encodeURIComponent(columnKey)}`, {
    method: "DELETE",
  });

  const j = (await r.json().catch(() => null)) as SpecificDateShipmentTemplateResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return String(j?.key || columnKey);
}
