export type UnifiedSearchRange = {
  startKey: string;
  endKey: string;
};

export type UnifiedSearchResultItem = {
  id: number;
  sortKey: number | null;
  rowNumber: number | null;
  firstMatchedKey: string;
  matchedKeys: string[];
};

export type UnifiedSearchSuccessResponse = {
  ok: true;
  query: string;
  columns: string[];
  searchedRange: UnifiedSearchRange;
  total: number;
  returnedCount: number;
  truncated: boolean;
  results: UnifiedSearchResultItem[];
};

export type UnifiedSearchErrorResponse = {
  error: string;
};

export type UnifiedSearchResponse =
  | UnifiedSearchSuccessResponse
  | UnifiedSearchErrorResponse;

export type UnifiedSearchActiveMatch = {
  resultIndex: number;
  rowId: number;
  colKey: string;
  rowNumber: number | null;
};

export type UnifiedSearchHighlightState = {
  matchedRowIds: number[];
  activeRowId: number | null;
  activeColKey: string | null;
};

export type UnifiedSearchState = {
  open: boolean;
  keyword: string;
  loading: boolean;
  total: number;
  returnedCount: number;
  truncated: boolean;
  currentIndex: number;
  results: UnifiedSearchResultItem[];
};