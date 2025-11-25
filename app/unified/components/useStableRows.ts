"use client";

import { useRef } from "react";

export function useStableRows(currentRows: any[]) {
  const lastRows = useRef(currentRows);

  if (currentRows?.length > 0) {
    lastRows.current = currentRows;
  }

  return lastRows.current;
}
