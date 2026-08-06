import type { ReturnRecoveryColumn } from "@/views/dataUpload/return-recovery/columns";

export type ReturnRecoveryInsertPosition = "after" | "before";

export type ReturnRecoveryTemplateResponse = {
  ok: boolean;
  message?: string;
  column?: ReturnRecoveryColumn;
  columns?: ReturnRecoveryColumn[];
  key?: string;
};

export async function fetchReturnRecoveryCustomColumns(): Promise<ReturnRecoveryColumn[]> {
  const r = await fetch("/api/data-upload/return-recovery/columns", {
    method: "GET",
    cache: "no-store",
  });

  const j = (await r.json().catch(() => null)) as ReturnRecoveryTemplateResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return Array.isArray(j?.columns) ? j.columns : [];
}

export async function addReturnRecoveryCustomColumn(params: {
  label: string;
  referenceKey: string;
  position: ReturnRecoveryInsertPosition;
  width?: number;
}): Promise<ReturnRecoveryColumn[]> {
  const r = await fetch("/api/data-upload/return-recovery/columns", {
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

  const j = (await r.json().catch(() => null)) as ReturnRecoveryTemplateResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return Array.isArray(j?.columns) ? j.columns : [];
}

export async function deleteReturnRecoveryCustomColumn(key: string): Promise<string> {
  const columnKey = String(key || "").trim();

  const r = await fetch(`/api/data-upload/return-recovery/columns/${encodeURIComponent(columnKey)}`, {
    method: "DELETE",
  });

  const j = (await r.json().catch(() => null)) as ReturnRecoveryTemplateResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return String(j?.key || columnKey);
}