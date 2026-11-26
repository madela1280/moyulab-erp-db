"use client";

// app/views/manual/ManualView.tsx
//
// 사용설명서 카테고리 조립 화면: 좌측 검색+트리 네비게이션, 우측 콘텐츠 뷰어.

import { useState } from "react";
import { useManualTree } from "./hooks/useManualTree";
import ManualTree, { type ManualSelection } from "./components/ManualTree";
import ManualContent from "./components/ManualContent";
import ManualSearchBox from "./components/ManualSearchBox";

export default function ManualView() {
  const { tree, loading, reload } = useManualTree();
  const [selected, setSelected] = useState<ManualSelection | null>(null);

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 border-r border-slate-200 flex flex-col">
        <div className="p-3 border-b border-slate-100">
          <ManualSearchBox onSelect={setSelected} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-sm text-slate-400">불러오는 중...</div>
          ) : (
            <ManualTree tree={tree} selected={selected} onSelect={setSelected} />
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ManualContent selection={selected} onContentChanged={reload} />
      </div>
    </div>
  );
}
