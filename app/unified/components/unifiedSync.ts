export function mergeRows(localRows: any[], serverRows: any[]) {
  const map = new Map(serverRows.map((r) => [r.id, r]));

  const merged = localRows
    .map((r) => map.get(r.id) || null)
    .filter(Boolean);

  return merged;
}
