"use client";

// app/views/manual/components/ManualTree.tsx
//
// 좌측 세로 트리 네비게이션: 카테고리 > 소카테고리 > 세부카테고리를 클릭해서 펼친다.

import { useState } from "react";
import type { ManualTreeCategory } from "../hooks/useManualTree";

export type ManualSelection = { category: string; subcategory: string; detail: string };

type Props = {
  tree: ManualTreeCategory[];
  selected: ManualSelection | null;
  onSelect: (sel: ManualSelection) => void;
};

function isSame(a: ManualSelection | null, b: ManualSelection) {
  return !!a && a.category === b.category && a.subcategory === b.subcategory && a.detail === b.detail;
}

export default function ManualTree({ tree, selected, onSelect }: Props) {
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleSub = (key: string) => {
    setOpenSubs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <nav className="flex flex-col gap-0.5 text-sm">
      {tree.map((cat) => {
        const catOpen = openCategories.has(cat.category);
        const catSel = { category: cat.category, subcategory: "", detail: "" };
        return (
          <div key={cat.category}>
            <button
              type="button"
              onClick={() => {
                toggleCategory(cat.category);
                onSelect(catSel);
              }}
              className={`w-full text-left px-2 py-1.5 rounded font-medium hover:bg-slate-100 ${
                isSame(selected, catSel) ? "bg-blue-50 text-blue-700" : "text-slate-800"
              }`}
            >
              <span className="inline-block w-4">{cat.subs.length > 0 ? (catOpen ? "▾" : "▸") : ""}</span>
              {cat.title}
            </button>

            {catOpen &&
              cat.subs.map((sub) => {
                const subKey = `${cat.category}>${sub.subcategory}`;
                const subOpen = openSubs.has(subKey);
                const subSel = { category: cat.category, subcategory: sub.subcategory, detail: "" };
                return (
                  <div key={subKey} className="ml-4">
                    <button
                      type="button"
                      onClick={() => {
                        toggleSub(subKey);
                        onSelect(subSel);
                      }}
                      className={`w-full text-left px-2 py-1 rounded hover:bg-slate-100 ${
                        isSame(selected, subSel) ? "bg-blue-50 text-blue-700" : "text-slate-700"
                      }`}
                    >
                      <span className="inline-block w-4">
                        {sub.details.length > 0 ? (subOpen ? "▾" : "▸") : ""}
                      </span>
                      {sub.title}
                    </button>

                    {subOpen &&
                      sub.details.map((d) => {
                        const detSel = { category: cat.category, subcategory: sub.subcategory, detail: d.detail };
                        return (
                          <button
                            key={d.detail}
                            type="button"
                            onClick={() => onSelect(detSel)}
                            className={`block w-full text-left ml-8 px-2 py-1 rounded hover:bg-slate-100 ${
                              isSame(selected, detSel) ? "bg-blue-50 text-blue-700" : "text-slate-600"
                            }`}
                          >
                            {d.title}
                          </button>
                        );
                      })}
                  </div>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}
