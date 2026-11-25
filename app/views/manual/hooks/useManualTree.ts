// app/views/manual/hooks/useManualTree.ts

import { useCallback, useEffect, useState } from "react";
import { fetchManualTree, type ManualTreeNode } from "../service/manualApi";

export type ManualTreeDetail = { detail: string; title: string };
export type ManualTreeSub = { subcategory: string; title: string; details: ManualTreeDetail[] };
export type ManualTreeCategory = { category: string; title: string; subs: ManualTreeSub[] };

function buildTree(nodes: ManualTreeNode[]): ManualTreeCategory[] {
  const byCategory = new Map<string, ManualTreeNode[]>();
  for (const n of nodes) {
    if (!byCategory.has(n.category)) byCategory.set(n.category, []);
    byCategory.get(n.category)!.push(n);
  }

  const categories: ManualTreeCategory[] = [];
  for (const [category, catNodes] of byCategory) {
    const rootNode = catNodes.find((n) => n.subcategory === "" && n.detail === "");
    const order = Math.min(...catNodes.map((n) => n.order_index));

    const bySub = new Map<string, ManualTreeNode[]>();
    for (const n of catNodes) {
      if (n.subcategory === "") continue;
      if (!bySub.has(n.subcategory)) bySub.set(n.subcategory, []);
      bySub.get(n.subcategory)!.push(n);
    }

    const subs: ManualTreeSub[] = [];
    for (const [subcategory, subNodes] of bySub) {
      const subRoot = subNodes.find((n) => n.detail === "");
      const subOrder = Math.min(...subNodes.map((n) => n.order_index));
      const details: ManualTreeDetail[] = subNodes
        .filter((n) => n.detail !== "")
        .sort((a, b) => a.order_index - b.order_index)
        .map((n) => ({ detail: n.detail, title: n.title || n.detail }));

      subs.push({
        subcategory,
        title: subRoot?.title || subcategory,
        details,
        // @ts-ignore 정렬용 임시 필드
        __order: subOrder,
      } as ManualTreeSub & { __order: number });
    }

    subs.sort((a: any, b: any) => a.__order - b.__order);

    categories.push({
      category,
      title: rootNode?.title || category,
      subs,
      // @ts-ignore 정렬용 임시 필드
      __order: order,
    } as ManualTreeCategory & { __order: number });
  }

  categories.sort((a: any, b: any) => a.__order - b.__order);
  return categories;
}

export function useManualTree() {
  const [tree, setTree] = useState<ManualTreeCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const nodes = await fetchManualTree();
      setTree(buildTree(nodes));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { tree, loading, reload };
}
