import { useRef } from "react";

/**
 * 로딩 중에도 기존 rows를 유지하여
 * 깜빡임을 방지하는 안정화 훅
 */
export function useStableRows(currentRows: any[]) {
  const lastRows = useRef(currentRows);
  if (currentRows?.length > 0) {
    lastRows.current = currentRows;
  }
  return lastRows.current;
}
