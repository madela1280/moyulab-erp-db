import type { PartnerAllRow } from "../types.partnerAll";

export function buildSectionRowSpans(rows: PartnerAllRow[]) {
  const spans: Record<number, number> = {};

  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].showSection) continue;

    let j = i + 1;
    while (j < rows.length && !rows[j].showSection) j += 1;

    spans[i] = j - i;
  }

  return spans;
}