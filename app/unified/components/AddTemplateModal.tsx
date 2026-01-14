"use client";

import { useEffect, useMemo, useState } from "react";

export default function AddTemplateModal({
  open,
  onClose,
  referenceOptions,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  referenceOptions: string[];
  onSubmit: (payload: { name: string; referenceKey: string; position: "after" | "before" }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [referenceKey, setReferenceKey] = useState("");
  const [position, setPosition] = useState<"after" | "before">("after");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const defaultRef = useMemo(() => referenceOptions[0] ?? "", [referenceOptions]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setPosition("after");
    setReferenceKey(defaultRef);
    setError("");
  }, [open, defaultRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center" onMouseDown={onClose}>
      <div
        className="bg-white w-[520px] max-w-[92vw] rounded border shadow p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">양식추가(새 컬럼 추가)</div>
          <button className="text-xs px-2 py-1 border rounded bg-slate-50" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="mt-3 space-y-3 text-xs">
          <div>
            <div className="text-slate-700 mb-1">양식(컬럼) 이름</div>
            <input
              className="w-full border rounded px-2 py-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 재방문일 / 메모3 ..."
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-slate-700 mb-1">기준 컬럼</div>
              <select
                className="w-full border rounded px-2 py-1"
                value={referenceKey}
                onChange={(e) => setReferenceKey(e.target.value)}
              >
                {referenceOptions.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-slate-700 mb-1">삽입 위치</div>
              <select
                className="w-full border rounded px-2 py-1"
                value={position}
                onChange={(e) => setPosition(e.target.value as any)}
              >
                <option value="after">뒤(기준 컬럼 뒤)</option>
                <option value="before">앞(기준 컬럼 앞)</option>
              </select>
            </div>
          </div>

          {error && <div className="text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button className="text-xs px-3 py-1 border rounded bg-slate-50" onClick={onClose} disabled={loading}>
              취소
            </button>

            <button
              className="text-xs px-3 py-1 border rounded bg-slate-800 text-white disabled:opacity-60"
              disabled={loading}
              onClick={async () => {
                setError("");
                const nm = name.trim();
                if (!nm) return setError("이름을 입력해 주세요.");
                if (!referenceKey) return setError("기준 컬럼을 선택해 주세요.");

                setLoading(true);
                try {
                  await onSubmit({ name: nm, referenceKey, position });
                } catch (e: any) {
                  setError(e?.message || "저장에 실패했습니다.");
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? "추가 중..." : "추가"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}