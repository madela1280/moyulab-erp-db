import type {
  UnifiedSearchActiveMatch,
  UnifiedSearchHighlightState,
  UnifiedSearchResultItem,
} from "@/unified/search/unifiedSearch.types";

type BuildUnifiedSearchHighlightArgs = {
  results: UnifiedSearchResultItem[];
  currentIndex: number;
  fallbackColKey?: string | null;
};

function normalizeIndex(index: number, length: number) {
  if (!Number.isFinite(index) || length <= 0) return -1;
  return Math.max(0, Math.min(length - 1, Math.floor(index)));
}

function normalizeColKey(v: unknown, fallbackColKey?: string | null) {
  const key = String(v ?? "").trim();
  if (key) return key;

  const fallback = String(fallbackColKey ?? "").trim();
  return fallback || null;
}

export function getUnifiedSearchMatchedRowIds(results: UnifiedSearchResultItem[]) {
  const set = new Set<number>();

  for (const item of results || []) {
    const id = Number(item?.id ?? 0);
    if (Number.isFinite(id) && id > 0) {
      set.add(id);
    }
  }

  return Array.from(set);
}

export function getUnifiedSearchActiveMatch(args: BuildUnifiedSearchHighlightArgs): UnifiedSearchActiveMatch | null {
  const results = Array.isArray(args.results) ? args.results : [];
  const index = normalizeIndex(args.currentIndex, results.length);

  if (index < 0) return null;

  const item = results[index];
  if (!item) return null;

  const rowId = Number(item.id ?? 0);
  if (!Number.isFinite(rowId) || rowId <= 0) return null;

  const colKey = normalizeColKey(item.firstMatchedKey, args.fallbackColKey);
  if (!colKey) return null;

  const rowNumber =
    item.rowNumber == null || !Number.isFinite(Number(item.rowNumber))
      ? null
      : Number(item.rowNumber);

  return {
    resultIndex: index,
    rowId,
    colKey,
    rowNumber,
  };
}

export function buildUnifiedSearchHighlight(
  args: BuildUnifiedSearchHighlightArgs
): UnifiedSearchHighlightState {
  const matchedRowIds = getUnifiedSearchMatchedRowIds(args.results);
  const activeMatch = getUnifiedSearchActiveMatch(args);

  return {
    matchedRowIds,
    activeRowId: activeMatch?.rowId ?? null,
    activeColKey: activeMatch?.colKey ?? null,
  };
}