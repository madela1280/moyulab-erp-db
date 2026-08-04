export type ReturnRecoveryUnifiedSourceRow = {
  id: number;
  data: Record<string, any>;
};

export type FetchReturnRecoveryFromUnifiedResponse = {
  ok: boolean;
  date?: string;
  message?: string;
  rows: ReturnRecoveryUnifiedSourceRow[];
};

export async function fetchReturnRecoveryFromUnified(
  returnRequestDate: string
): Promise<FetchReturnRecoveryFromUnifiedResponse> {
  const date = String(returnRequestDate || "").trim();

  const r = await fetch(`/api/data-upload/return-recovery/from-unified?date=${encodeURIComponent(date)}`, {
    method: "GET",
    cache: "no-store",
  });

  const j = (await r.json().catch(() => null)) as FetchReturnRecoveryFromUnifiedResponse | null;

  if (!r.ok) {
    throw new Error(j?.message || `FAILED(${r.status})`);
  }

  return {
    ok: Boolean(j?.ok),
    date: j?.date,
    message: j?.message,
    rows: Array.isArray(j?.rows) ? j.rows : [],
  };
}