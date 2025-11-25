export function mergeRows(localRows, serverRows) {
  const map = new Map(serverRows.map((r) => [r.id, r]));

  const merged = localRows
    .map((r) => map.get(r.id) || null)
    .filter(Boolean);

  return merged;
}
