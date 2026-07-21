type RowValues = Record<string, string>;

export type SignupDraftGetResponse = {
  id: number | null;
  rows: RowValues[];
  updated_at?: string | null;
};

export async function apiGetSignupDraft(): Promise<SignupDraftGetResponse> {
  const r = await fetch("/api/unified/signup-draft", { cache: "no-store" });
  if (!r.ok) throw new Error(`FAILED(${r.status})`);
  const j = (await r.json()) as SignupDraftGetResponse;
  return {
    id: j?.id ?? null,
    rows: Array.isArray(j?.rows) ? j.rows : [],
    updated_at: j?.updated_at ?? null,
  };
}

export async function apiPatchSignupDraft(
  rows: RowValues[],
  options?: { allowEmptyOverwrite?: boolean }
): Promise<SignupDraftGetResponse> {
  const r = await fetch("/api/unified/signup-draft", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows,
      allowEmptyOverwrite: !!options?.allowEmptyOverwrite,
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `FAILED(${r.status})`);
  }
  return (await r.json()) as SignupDraftGetResponse;
}

export async function apiDeleteSignupDraft(): Promise<{ ok: boolean }> {
  const r = await fetch("/api/unified/signup-draft", { method: "DELETE" });
  if (!r.ok) throw new Error(`FAILED(${r.status})`);
  return (await r.json()) as { ok: boolean };
}