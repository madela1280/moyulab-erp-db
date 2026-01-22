export function normalizeDeviceNo(v: any) {
  return String(v ?? "").trim();
}

export function deviceNoVariants(deviceNo: string) {
  const raw = normalizeDeviceNo(deviceNo);
  if (!raw) return [];

  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of [raw, upper, lower]) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

export function setHasDeviceNoCI(set: Set<string>, deviceNo: string) {
  for (const k of deviceNoVariants(deviceNo)) {
    if (set.has(k)) return true;
  }
  return false;
}

export function mapGetDeviceNoCI<T>(
  map: Record<string, T> | undefined | null,
  deviceNo: string
): T | undefined {
  if (!map) return undefined;

  for (const k of deviceNoVariants(deviceNo)) {
    if (Object.prototype.hasOwnProperty.call(map, k)) return map[k];
  }
  return undefined;
}