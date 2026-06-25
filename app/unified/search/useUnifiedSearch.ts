"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getEmptyUnifiedSearchResponse,
  searchUnifiedRows,
} from "@/unified/search/serviceUnifiedSearch";
import type {
  UnifiedSearchActiveMatch,
  UnifiedSearchResultItem,
  UnifiedSearchState,
  UnifiedSearchSuccessResponse,
} from "@/unified/search/unifiedSearch.types";

export type UseUnifiedSearchOptions = {
  limit?: number;
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

function createInitialState(): UnifiedSearchState {
  return {
    open: false,
    keyword: "",
    loading: false,
    total: 0,
    returnedCount: 0,
    truncated: false,
    currentIndex: -1,
    results: [],
  };
}

function clampIndex(index: number, length: number) {
  if (length <= 0) return -1;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(index)));
}

export function useUnifiedSearch(options?: UseUnifiedSearchOptions) {
  const limit = normalizeLimit(options?.limit);

  const [state, setState] = useState<UnifiedSearchState>(() => createInitialState());
  const [error, setError] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch {
          // ignore
        }
        abortRef.current = null;
      }
    };
  }, []);

  const currentResult = useMemo<UnifiedSearchResultItem | null>(() => {
    if (state.currentIndex < 0 || state.currentIndex >= state.results.length) return null;
    return state.results[state.currentIndex] ?? null;
  }, [state.currentIndex, state.results]);

  const activeMatch = useMemo<UnifiedSearchActiveMatch | null>(() => {
    if (!currentResult) return null;
    return {
      resultIndex: state.currentIndex,
      rowId: currentResult.id,
      colKey: currentResult.firstMatchedKey,
      rowNumber: currentResult.rowNumber,
    };
  }, [currentResult, state.currentIndex]);

  const matchedRowIds = useMemo(() => {
    const set = new Set<number>();
    for (const item of state.results) {
      if (Number.isFinite(item.id) && item.id > 0) set.add(item.id);
    }
    return Array.from(set);
  }, [state.results]);

  const hasResults = state.results.length > 0;
  const isAtLastResult = !hasResults || state.currentIndex >= state.results.length - 1;

  const setKeyword = useCallback((nextKeyword: string) => {
    const next = normalizeKeyword(nextKeyword);
    setState((prev) => ({
      ...prev,
      keyword: next,
    }));
    setError("");
  }, []);

  const openSearch = useCallback((nextKeyword?: string) => {
    setState((prev) => ({
      ...prev,
      open: true,
      keyword:
        nextKeyword == null ? prev.keyword : normalizeKeyword(nextKeyword),
    }));
    setError("");
  }, []);

  const clearResults = useCallback((keepOpen = true, keepKeyword = true) => {
    setState((prev) => ({
      open: keepOpen ? prev.open : false,
      keyword: keepKeyword ? prev.keyword : "",
      loading: false,
      total: 0,
      returnedCount: 0,
      truncated: false,
      currentIndex: -1,
      results: [],
    }));
  }, []);

  const closeSearch = useCallback(() => {
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
        // ignore
      }
      abortRef.current = null;
    }
    setError("");
    setState(createInitialState());
  }, []);

  const applyResponse = useCallback((response: UnifiedSearchSuccessResponse) => {
    setState((prev) => ({
      ...prev,
      open: true,
      loading: false,
      keyword: normalizeKeyword(response.query),
      total: Number(response.total ?? 0),
      returnedCount: Number(response.returnedCount ?? 0),
      truncated: !!response.truncated,
      currentIndex: response.results.length ? 0 : -1,
      results: Array.isArray(response.results) ? response.results : [],
    }));
  }, []);

  const submitSearch = useCallback(
    async (overrideKeyword?: string) => {
      const keyword = normalizeKeyword(
        overrideKeyword == null ? state.keyword : overrideKeyword
      );

      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch {
          // ignore
        }
        abortRef.current = null;
      }

      setError("");

      if (!keyword) {
        const empty = getEmptyUnifiedSearchResponse("");
        setState((prev) => ({
          ...prev,
          open: true,
          loading: false,
          keyword: "",
          total: empty.total,
          returnedCount: empty.returnedCount,
          truncated: empty.truncated,
          currentIndex: -1,
          results: empty.results,
        }));
        return empty;
      }

      const ac = new AbortController();
      abortRef.current = ac;

      setState((prev) => ({
        ...prev,
        open: true,
        loading: true,
        keyword,
      }));

      try {
        const response = await searchUnifiedRows({
          keyword,
          limit,
          signal: ac.signal,
        });

        if (!mountedRef.current || ac.signal.aborted) return null;

        applyResponse(response);
        return response;
      } catch (err: any) {
        if (!mountedRef.current || ac.signal.aborted) return null;

        const message = String(err?.message ?? "SEARCH_FAILED");
        setError(message);

        setState((prev) => ({
          ...prev,
          open: true,
          loading: false,
          keyword,
          total: 0,
          returnedCount: 0,
          truncated: false,
          currentIndex: -1,
          results: [],
        }));

        throw err;
      } finally {
        if (abortRef.current === ac) {
          abortRef.current = null;
        }
      }
    },
    [applyResponse, limit, state.keyword]
  );

  const moveNext = useCallback(() => {
    let moved = false;

    setState((prev) => {
      if (!prev.results.length) return prev;

      const nextIndex = clampIndex(prev.currentIndex + 1, prev.results.length);
      moved = nextIndex !== prev.currentIndex;

      return {
        ...prev,
        currentIndex: nextIndex,
      };
    });

    return moved;
  }, []);

  const goToIndex = useCallback((index: number) => {
    setState((prev) => {
      if (!prev.results.length) return prev;
      return {
        ...prev,
        currentIndex: clampIndex(index, prev.results.length),
      };
    });
  }, []);

  const replaceResults = useCallback((results: UnifiedSearchResultItem[], keyword?: string) => {
    const nextKeyword = normalizeKeyword(keyword ?? state.keyword);
    setState((prev) => ({
      ...prev,
      open: true,
      loading: false,
      keyword: nextKeyword,
      total: results.length,
      returnedCount: results.length,
      truncated: false,
      currentIndex: results.length ? 0 : -1,
      results,
    }));
    setError("");
  }, [state.keyword]);

  return {
    state,
    error,
    open: state.open,
    keyword: state.keyword,
    loading: state.loading,
    total: state.total,
    returnedCount: state.returnedCount,
    truncated: state.truncated,
    currentIndex: state.currentIndex,
    results: state.results,
    hasResults,
    isAtLastResult,
    currentResult,
    activeMatch,
    matchedRowIds,
    setKeyword,
    openSearch,
    clearResults,
    closeSearch,
    submitSearch,
    moveNext,
    goToIndex,
    replaceResults,
  };
}