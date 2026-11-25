"use client";

// app/views/manual/components/ManualEditor.tsx
//
// 메뉴얼 콘텐츠 작성/수정 폼: 제목, 본문, 캡쳐 이미지 업로드.

import { useRef, useState } from "react";
import type { ManualContentItem } from "../service/manualApi";
import { saveManualContent, uploadManualImage } from "../service/manualApi";

type Props = {
  category: string;
  subcategory: string;
  detail: string;
  initial: ManualContentItem | null;
  onSaved: () => void;
  onCancel: () => void;
};

export default function ManualEditor({ category, subcategory, detail, initial, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [keywords, setKeywords] = useState(initial?.keywords ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadManualImage(file);
        if (url) setImages((prev) => [...prev, url]);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (url: string) => {
    setImages((prev) => prev.filter((u) => u !== url));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await saveManualContent({ category, subcategory, detail, title, body, images, keywords });
      if (ok) onSaved();
      else alert("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 border border-slate-200 rounded bg-slate-50">
      <div>
        <label className="block text-xs text-slate-500 mb-1">제목</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">본문</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm font-mono"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">검색 키워드(공백 구분)</label>
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">캡쳐 화면</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((url) => (
            <div key={url} className="relative">
              <img src={url} alt="" className="h-24 rounded border border-slate-300" />
              <button
                type="button"
                onClick={() => removeImage(url)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleUpload(e.target.files)}
          disabled={uploading}
        />
        {uploading && <span className="text-xs text-slate-500 ml-2">업로드 중...</span>}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded border border-slate-300 text-slate-600 hover:bg-slate-100"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}
