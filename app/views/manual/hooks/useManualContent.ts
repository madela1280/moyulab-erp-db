// app/views/manual/hooks/useManualContent.ts

import { useCallback, useEffect, useState } from "react";
import { fetchManualContent, type ManualContentItem } from "../service/manualApi";

export function useManualContent(category: string | null, subcategory: string, detail: string) {
  const [item, setItem] = useState<ManualContentItem | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!category) {
      setItem(null);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchManualContent(category, subcategory, detail);
      setItem(result);
    } finally {
      setLoading(false);
    }
  }, [category, subcategory, detail]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { item, loading, reload };
}
