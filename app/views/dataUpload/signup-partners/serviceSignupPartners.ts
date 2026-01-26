type SignupPartnersResponse = {
  partnerOptions: string[];
};

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

export async function apiGetSignupPartners(): Promise<SignupPartnersResponse> {
  const r = await fetch("/api/signup-partners", { cache: "no-store" });
  if (!r.ok) throw new Error(`FAILED(${r.status})`);
  const j = (await r.json()) as Partial<SignupPartnersResponse> | null;
  return {
    partnerOptions: Array.isArray(j?.partnerOptions) ? j!.partnerOptions.map(String) : [],
  };
}

export async function apiPatchSignupPartners(body: {
  partnerOptions?: string[];
  add?: string;
  remove?: string;
}): Promise<SignupPartnersResponse> {
  const payload: any = {};
  if (Array.isArray(body.partnerOptions)) payload.partnerOptions = body.partnerOptions.map(normalizeName);
  if (body.add != null) payload.add = normalizeName(body.add);
  if (body.remove != null) payload.remove = normalizeName(body.remove);

  const r = await fetch("/api/signup-partners", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `FAILED(${r.status})`);
  }

  const j = (await r.json()) as Partial<SignupPartnersResponse> | null;
  return {
    partnerOptions: Array.isArray(j?.partnerOptions) ? j!.partnerOptions.map(String) : [],
  };
}