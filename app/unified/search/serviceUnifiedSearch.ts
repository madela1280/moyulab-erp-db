import {
  getUnifiedSearchColumns,
  getUnifiedSearchRange,
} from "@/unified/search/searchScope";
import type {
  UnifiedSearchResponse,
  UnifiedSearchResultItem,
  UnifiedSearchSuccessResponse,
} from "@/unified/search/unifiedSearch.types";

export type SearchUnifiedRowsParams = {
  keyword: string;
  limit?: number;
  signal?: AbortSignal;
};

const DEFAULT_LIMIT = 300;

function normalizeKeyword(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeLimit(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.floor(n);
}

function buildSearchUrl(keyword: string, limit: number) {
  const sp = new URLSearchParams();
  sp.set("q", keyword);
  sp.set("limit", String(limit));
  return `/api/unified/search?${sp.toString()}`;
}

function createEmptySearchResponse(keyword = ""): UnifiedSearchSuccessResponse {
  return {
    ok: true,
    query: normalizeKeyword(keyword),
    columns: getUnifiedSearchColumns(),
    searchedRange: getUnifiedSearchRange(),
    total: 0,
    returnedCount: 0,
    truncated: false,
    results: [],
  };
}

function isSearchSuccessResponse(v: any): v is UnifiedSearchSuccessResponse {
  return !!v && v.ok === true && Array.isArray(v.results);
}

function sanitizeResultItem(v: any): UnifiedSearchResultItem {
  return {
    id: Number(v?.id ?? 0),
    sortKey: v?.sortKey == null ? null : Number(v.sortKey),
    rowNumber: v?.rowNumber == null ? null : Number(v.rowNumber),
    firstMatchedKey: String(v?.firstMatchedKey ?? ""),
    matchedKeys: Array.isArray(v?.matchedKeys) ? v.matchedKeys.map(String) : [],
  };
}

function sanitizeSuccessResponse(v: UnifiedSearchSuccessResponse): UnifiedSearchSuccessResponse {
  return {
    ok: true,
    query: normalizeKeyword(v.query),
    columns: Array.isArray(v.columns) ? v.columns.map(String) : getUnifiedSearchColumns(),
    searchedRange: {
      startKey: String(v.searchedRange?.startKey ?? getUnifiedSearchRange().startKey),
      endKey: String(v.searchedRange?.endKey ?? getUnifiedSearchRange().endKey),
    },
    total: Number(v.total ?? 0),
    returnedCount: Number(v.returnedCount ?? 0),
    truncated: !!v.truncated,
    results: Array.isArray(v.results) ? v.results.map(sanitizeResultItem) : [],
  };
}

export async function searchUnifiedRows(
  params: SearchUnifiedRowsParams
): Promise<UnifiedSearchSuccessResponse> {
  const keyword = normalizeKeyword(params.keyword);
  const limit = normalizeLimit(params.limit);

  if (!keyword) {
    return createEmptySearchResponse("");
  }

  const res = await fetch(buildSearchUrl(keyword, limit), {
    method: "GET",
    cache: "no-store",
    signal: params.signal,
    headers: {
      Accept: "application/json",
    },
  });

  const json = (await res.json().catch(() => null)) as UnifiedSearchResponse | null;

  if (!res.ok) {
    const message =
      json && "error" in json && typeof json.error === "string"
        ? json.error
        : `SEARCH_REQUEST_FAILED(${res.status})`;
    throw new Error(message);
  }

  if (!json || !isSearchSuccessResponse(json)) {
    throw new Error("INVALID_SEARCH_RESPONSE");
  }

  return sanitizeSuccessResponse(json);
}

export function getEmptyUnifiedSearchResponse(keyword = "") {
  return createEmptySearchResponse(keyword);
}