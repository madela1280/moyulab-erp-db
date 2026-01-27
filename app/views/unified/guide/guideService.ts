// app/views/unified/guide/guideService.ts

export type GuideCategory = {
  name: string;
  sort_key?: number;
  created_by?: string | null;
  created_at?: string | null;
};

export type PartnerGuideMapping = {
  partner_name: string;
  guide_name: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
};

function normalizeName(v: any) {
  return String(v ?? "").trim();
}

export async function fetchGuideCategories(): Promise<GuideCategory[]> {
  const r = await fetch("/api/guide-categories", { cache: "no-store" });
  if (!r.ok) throw new Error(await r.text().catch(() => `FAILED(${r.status})`));

  const j = await r.json().catch(() => null);
  const list = Array.isArray(j?.categories) ? j.categories : [];

  return list
    .map((x: any) => ({
      name: normalizeName(x?.name),
      sort_key: Number(x?.sort_key ?? 0),
      created_by: x?.created_by ?? null,
      created_at: x?.created_at ?? null,
    }))
    .filter((x: GuideCategory) => !!x.name);
}

export async function createGuideCategory(name: string): Promise<void> {
  const nm = normalizeName(name);
  const r = await fetch("/api/guide-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nm }),
  });
  if (!r.ok) throw new Error(await r.text().catch(() => `FAILED(${r.status})`));
}

export async function deleteGuideCategory(name: string): Promise<void> {
  const nm = normalizeName(name);
  const r = await fetch("/api/guide-categories", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nm }),
  });
  if (!r.ok) throw new Error(await r.text().catch(() => `FAILED(${r.status})`));
}

export async function fetchPartnerGuideMappings(): Promise<PartnerGuideMapping[]> {
  const r = await fetch("/api/partner-guide-map", { cache: "no-store" });
  if (!r.ok) throw new Error(await r.text().catch(() => `FAILED(${r.status})`));

  const j = await r.json().catch(() => null);
  const list = Array.isArray(j?.mappings) ? j.mappings : [];

  return list
    .map((x: any) => ({
      partner_name: normalizeName(x?.partner_name),
      guide_name: normalizeName(x?.guide_name) || null,
      updated_by: x?.updated_by ?? null,
      updated_at: x?.updated_at ?? null,
    }))
    .filter((x: PartnerGuideMapping) => !!x.partner_name);
}

export async function patchPartnerGuideMapping(partner_name: string, guide_name: string | null): Promise<void> {
  const p = normalizeName(partner_name);
  const g = guide_name == null ? null : normalizeName(guide_name) || null;

  const r = await fetch("/api/partner-guide-map", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partner_name: p, guide_name: g }),
  });
  if (!r.ok) throw new Error(await r.text().catch(() => `FAILED(${r.status})`));
}

export async function deletePartnerGuideMapping(partner_name: string): Promise<void> {
  const p = normalizeName(partner_name);

  const r = await fetch("/api/partner-guide-map", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partner_name: p }),
  });
  if (!r.ok) throw new Error(await r.text().catch(() => `FAILED(${r.status})`));
}