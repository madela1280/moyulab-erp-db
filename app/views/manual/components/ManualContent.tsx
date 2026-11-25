"use client";

// app/views/manual/components/ManualContent.tsx
//
// 우측 콘텐츠 뷰어: 선택된 노드의 제목/본문/캡쳐 이미지를 보여주고, 수정 모드로 전환할 수 있다.

import { useState } from "react";
import { useManualContent } from "../hooks/useManualContent";
import ManualEditor from "./ManualEditor";
import type { ManualSelection } from "./ManualTree";

type Props = {
  selection: ManualSelection | null;
  onContentChanged: () => void;
};

export default function ManualContent({ selection, onContentChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const { item, loading, reload } = useManualContent(
    selection?.category ?? null,
    selection?.subcategory ?? "",
    selection?.detail ?? ""
  );

  if (!selection) {
    return <div className="p-6 text-sm text-slate-400">왼쪽에서 카테고리를 선택하세요.</div>;
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-400">불러오는 중...</div>;
  }

  if (editing) {
    return (
      <div className="p-6">
        <ManualEditor
          category={selection.category}
          subcategory={selection.subcategory}
          detail={selection.detail}
          initial={item}
          onSaved={async () => {
            setEditing(false);
            await reload();
            onContentChanged();
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const path = [selection.category, selection.subcategory, selection.detail].filter(Boolean).join(" > ");

  return (
    <div className="p-6 max-w-3xl">
      <div className="text-xs text-slate-400 mb-1">{path}</div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">{item?.title || "(제목 없음)"}</h2>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="px-3 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
        >
          수정
        </button>
      </div>

      {item?.body ? (
        <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed mb-4">{item.body}</p>
      ) : (
        <p className="text-sm text-slate-400 mb-4">작성된 내용이 없습니다.</p>
      )}

      {item?.images && item.images.length > 0 && (
        <div className="flex flex-col gap-3">
          {item.images.map((url) => (
            <img key={url} src={url} alt="" className="max-w-full border border-slate-200 rounded" />
          ))}
        </div>
      )}
    </div>
  );
}
